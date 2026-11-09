"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import AdminGuard from "@/components/admin/AdminGuard";
import { useAdminProviderInfo } from "@/components/admin/useAdminProviderInfo";
import { useAdminOrderAutoSync } from "@/components/admin/useAdminOrderAutoSync";
import { useLanguage } from "@/context/LanguageContext";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import SearchInput from "@/components/ui/SearchInput";
import Tabs from "@/components/ui/Tabs";
import Toast, { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/Badge";
import {
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  SkeletonRows,
  Stat,
} from "@/components/ui/Primitives";
import {
  formatCurrency,
  formatMultiplier,
  formatNumber,
  formatSignedCurrency,
} from "@/lib/constants";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  subscribeAllOrders,
  timestampToDate,
  type OrderDoc,
} from "@/lib/db";
import { needsProviderReview } from "@/lib/order-visibility";
import {
  calculateOrderFinancials,
  summariseOrderFinancials,
} from "@/lib/financials";

type OrderTab = "all" | "attention" | "refunded";

const MAX_ROWS = 200;
const DEFAULT_PROFIT_MARGIN = 2.25;
const PROVIDER_ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

interface ResolutionResponse {
  error?: string;
  success?: boolean;
  alreadyResolved?: boolean;
  refundedAmount?: number;
  totalRefunded?: number;
  providerOrderId?: string;
}

function refundSummary(order: OrderDoc): string {
  if (order.refundAnomaly) return "Anomaly";

  if (order.refundState === "refunded_to_user") {
    return order.refundedAmount !== undefined
      ? `${formatCurrency(order.refundedAmount)} refunded`
      : "Refunded";
  }

  if (order.refundState === "partially_refunded") {
    return order.refundedAmount !== undefined
      ? `${formatCurrency(order.refundedAmount)} partial`
      : "Partial refund";
  }

  if (order.refundState === "awaiting_provider_refund") {
    return "Awaiting provider";
  }

  return "—";
}

function remainingRefund(order: OrderDoc): number {
  const charge = Number(order.charge ?? 0);
  const refunded = Number(order.refundedAmount ?? 0);
  return Math.max(0, Math.round((charge - refunded) * 100) / 100);
}

async function postResolution(
  orderId: string,
  action: "refund_cancel" | "attach_provider" | "dismiss_review",
  providerOrderId?: string
): Promise<ResolutionResponse> {
  const user = getFirebaseAuth().currentUser;

  if (!user) {
    throw new Error("Your session expired. Sign in again.");
  }

  const token = await user.getIdToken();
  const response = await fetch("/api/admin/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId, action, providerOrderId }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ResolutionResponse
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "The resolution action failed.");
  }

  return payload ?? {};
}

export default function AdminOrdersPage() {
  return (
    <AdminGuard>
      <AdminOrdersContent />
    </AdminGuard>
  );
}

function AdminOrdersContent() {
  const { t } = useLanguage();
  const { toasts, addToast, removeToast } = useToast();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<OrderTab>("all");
  const [resolving, setResolving] = useState<OrderDoc | null>(null);
  const provider = useAdminProviderInfo(true);
  const effectiveMargin = provider.profitMargin ?? DEFAULT_PROFIT_MARGIN;
  const financials = useMemo(
    () => summariseOrderFinancials(orders, effectiveMargin),
    [orders, effectiveMargin]
  );

  useAdminOrderAutoSync({
    enabled: true,
    onSynced: provider.refresh,
  });

  const deferredSearch = useDeferredValue(search);
  const query = deferredSearch.trim().toLowerCase();

  const handleLoadError = useCallback((error: Error) => {
    console.error("Failed to load all orders:", error);
    setLoadError("The order ledger could not be loaded.");
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAllOrders(
      (nextOrders) => {
        setOrders(nextOrders);
        setLoading(false);
      },
      handleLoadError
    );

    return unsubscribe;
  }, [reloadKey, handleLoadError]);

  const counts = useMemo(
    () => ({
      all: orders.length,
      attention: orders.filter((order) => needsProviderReview(order)).length,
      refunded: orders.filter(
        (order) =>
          order.refundState === "partially_refunded" ||
          order.refundState === "refunded_to_user"
      ).length,
    }),
    [orders]
  );

  const attentionCount = counts.attention;
  const providerBalanceLabel = provider.loading
    ? "…"
    : provider.balance === null
      ? "Unavailable"
      : formatCurrency(provider.balance);

  const visibleOrders = useMemo(() => {
    const scoped = orders.filter((order) => {
      if (tab === "attention") return needsProviderReview(order);
      if (tab === "refunded") {
        return (
          order.refundState === "partially_refunded" ||
          order.refundState === "refunded_to_user"
        );
      }
      return true;
    });

    if (!query) return scoped;

    return scoped.filter((order) =>
      [
        order.id,
        order.providerOrderId,
        order.userEmail,
        order.userId,
        order.serviceName,
        order.serviceId,
        order.link,
        order.status,
        order.providerErrorCode,
        order.providerError,
        order.refundAnomaly,
      ].some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [orders, tab, query]);

  const handleResolved = useCallback(
    (message: string, type: "success" | "info") => {
      addToast(message, type);
      setResolving(null);
    },
    [addToast]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t("Administration", "الإدارة")}
        title={t("All orders", "كل الطلبات")}
        description={t(
          "Platform-wide ledger with provider references, refund state, and upstream errors. Auto-syncs while this page is open.",
          "سجل شامل للمنصة مع مراجع المزود وحالة الاسترداد وأخطاء المزود. تتم المزامنة تلقائيًا أثناء فتح هذه الصفحة."
        )}
        actions={
          <span className="num-sm text-ink-mute">
            {t(
              `${formatNumber(visibleOrders.length)} of ${formatNumber(
                orders.length
              )}`,
              `${formatNumber(visibleOrders.length)} من ${formatNumber(
                orders.length
              )}`
            )}
          </span>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label={t("Provider balance", "رصيد المزود")}
          value={providerBalanceLabel}
          tone={provider.error ? "danger" : "default"}
          note={
            provider.error
              ? provider.error
              : t(
                  `Live ${provider.currency} balance`,
                  `الرصيد المباشر ${provider.currency}`
                )
          }
        />
        <Stat
          label={t("Pricing multiplier", "مضاعف التسعير")}
          value={
            provider.profitMargin === null
              ? "—"
              : formatMultiplier(provider.profitMargin)
          }
          note={
            provider.profitPercent === null
              ? t("Selling multiplier", "معامل البيع")
              : t(
                  `+${formatNumber(provider.profitPercent)}% over provider cost`,
                  `+${formatNumber(provider.profitPercent)}% فوق تكلفة المزود`
                )
          }
        />
        <Stat
          label={t("Total net revenue", "إجمالي صافي الإيراد")}
          value={formatCurrency(financials.revenue)}
          note={t(
            "Customer charges net of refunds",
            "مدفوعات العملاء بعد خصم الاسترداد"
          )}
        />
        <Stat
          label={t("Realized net profit", "صافي الربح المحقق")}
          value={formatSignedCurrency(financials.netProfit)}
          tone={financials.netProfit >= 0 ? "positive" : "danger"}
          note={t(
            "Revenue minus delivered provider cost",
            "الإيراد ناقص تكلفة المزود المسلّمة"
          )}
        />
      </section>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-mute">
        <span>
          <span className="num-sm text-ink">{formatNumber(orders.length)}</span>{" "}
          {t("orders", "طلب")}
        </span>
        <span>
          <span className="num-sm text-ink">{formatNumber(attentionCount)}</span>{" "}
          {t("need review", "بحاجة للمراجعة")}
        </span>
        <span>
          <span className="num-sm text-ink">{formatNumber(counts.refunded)}</span>{" "}
          {t("refunded", "مسترد")}
        </span>
        <span>
          <span className="num-sm text-ink">
            {formatCurrency(financials.refunded)}
          </span>{" "}
          {t("refunded value", "قيمة المسترد")}
        </span>
      </div>

      <div className="space-y-3">
        <SearchInput
          label={t("Search all orders", "بحث في كل الطلبات")}
          value={search}
          onChange={setSearch}
          placeholder={t(
            "Search order, customer, service, provider error, or refund state",
            "ابحث بالطلب أو العميل أو الخدمة أو خطأ المزود أو حالة الاسترداد"
          )}
        />
        <div className="panel px-2 pt-1">
          <Tabs
            items={[
              { key: "all", label: t("All", "الكل"), count: counts.all },
              {
                key: "attention",
                label: t("Needs review", "بحاجة للمراجعة"),
                count: counts.attention,
              },
              {
                key: "refunded",
                label: t("Refunded", "مسترد"),
                count: counts.refunded,
              },
            ]}
            value={tab}
            onChange={setTab}
            label={t("Order scope", "نطاق الطلبات")}
          />
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={7} />
      ) : loadError ? (
        <ErrorState
          title={t("Order ledger unavailable", "سجل الطلبات غير متاح")}
          message={loadError}
          onRetry={() => {
            setLoading(true);
            setLoadError(null);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : visibleOrders.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={
            orders.length === 0
              ? t("No orders yet", "لا توجد طلبات بعد")
              : t("No orders match", "لا توجد طلبات مطابقة")
          }
          description={
            orders.length === 0
              ? t(
                  "Customer orders across the platform will appear here.",
                  "ستظهر هنا طلبات العملاء عبر المنصة."
                )
              : t(
                  "Change the scope tab or clear the search.",
                  "غيّر نطاق العرض أو امسح البحث."
                )
          }
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="scroll-x hidden lg:block">
            <table className="data-table min-w-[1480px]">
              <thead>
                <tr>
                  <th>{t("Order", "الطلب")}</th>
                  <th>{t("Customer", "العميل")}</th>
                  <th>{t("Service", "الخدمة")}</th>
                  <th className="cell-end">{t("Charge", "المبلغ")}</th>
                  <th className="cell-end">{t("Provider cost", "تكلفة المزود")}</th>
                  <th className="cell-end">{t("Net profit", "صافي الربح")}</th>
                  <th>{t("Status", "الحالة")}</th>
                  <th>{t("Refund", "الاسترداد")}</th>
                  <th>{t("Provider error", "خطأ المزود")}</th>
                  <th>{t("Resolution", "المعالجة")}</th>
                  <th>{t("Placed", "التاريخ")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.slice(0, MAX_ROWS).map((order) => {
                  const money = calculateOrderFinancials(
                    order,
                    effectiveMargin
                  );

                  return (
                    <tr key={order.id}>
                    <td>
                      <span className="num-sm text-ink">
                        {order.providerOrderId ?? order.id.slice(0, 10)}
                      </span>
                      <p className="mt-0.5 text-[10.5px] text-ink-mute">
                        Local {order.id.slice(0, 10)}
                      </p>
                    </td>
                    <td>
                      <p className="max-w-[190px] truncate text-[12px] text-ink">
                        {order.userEmail || order.userId}
                      </p>
                    </td>
                    <td>
                      <p className="cell-strong max-w-[220px] truncate">
                        {order.serviceName || `Service ${order.serviceId}`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-mute">
                        {order.category || "Uncategorized"}
                      </p>
                    </td>
                    <td className="cell-end cell-num">
                      {formatCurrency(Number(order.charge ?? 0))}
                    </td>
                    <td className="cell-end cell-num">
                      {formatCurrency(money.providerCost)}
                    </td>
                    <td
                      className={`cell-end cell-num ${
                        money.netProfit < 0 ? "text-danger" : ""
                      }`}
                    >
                      {formatSignedCurrency(money.netProfit)}
                    </td>
                    <td>
                      <div className="space-y-1">
                        <StatusBadge status={order.status} />
                        {order.needsReconciliation ? (
                          <p className="text-[10.5px] font-medium text-danger">
                            Under review
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1">
                        <p
                          className={`text-[11.5px] ${
                            order.refundAnomaly
                              ? "font-medium text-danger"
                              : "text-ink-soft"
                          }`}
                        >
                          {refundSummary(order)}
                        </p>
                        {order.refundedToUserAt ? (
                          <p className="text-[10.5px] text-ink-mute">
                            {timestampToDate(order.refundedToUserAt)}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {order.providerErrorCode || order.providerError ? (
                        <div className="max-w-[280px] space-y-1">
                          {order.providerErrorCode ? (
                            <span className="status status-danger">
                              {order.providerErrorCode}
                            </span>
                          ) : null}
                          {order.providerError ? (
                            <p
                              className="truncate text-[10.5px] text-danger"
                              title={order.providerError}
                            >
                              {order.providerError}
                            </p>
                          ) : null}
                          {order.refundAnomaly ? (
                            <p
                              className="truncate text-[10.5px] text-warning"
                              title={order.refundAnomaly}
                            >
                              {order.refundAnomaly}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[11.5px] text-ink-mute">—</span>
                      )}
                    </td>
                    <td>
                      {needsProviderReview(order) ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          leadingIcon={<Icon name="shield" size={13} />}
                          onClick={() => setResolving(order)}
                        >
                          Resolve
                        </Button>
                      ) : (
                        <span className="text-[11.5px] text-ink-mute">—</span>
                      )}
                    </td>
                    <td className="cell-date whitespace-nowrap">
                      {timestampToDate(order.createdAt)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-line lg:hidden">
            {visibleOrders.slice(0, MAX_ROWS).map((order) => {
              const money = calculateOrderFinancials(order, effectiveMargin);

              return (
                <article key={order.id} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="num-sm text-[11.5px] text-ink">
                      {order.providerOrderId ?? order.id.slice(0, 10)}
                    </p>
                    <p className="mt-1 truncate text-[12.5px] font-medium text-ink">
                      {order.serviceName || `Service ${order.serviceId}`}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-mute">
                      {order.userEmail || order.userId}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 border-y border-line py-2">
                  <div>
                    <p className="rule-label">Charge</p>
                    <p className="num-sm mt-1 font-medium text-ink">
                      {formatCurrency(Number(order.charge ?? 0))}
                    </p>
                  </div>
                  <div>
                    <p className="rule-label">Provider cost</p>
                    <p className="num-sm mt-1 text-ink">
                      {formatCurrency(money.providerCost)}
                    </p>
                  </div>
                  <div>
                    <p className="rule-label">Net profit</p>
                    <p
                      className={`num-sm mt-1 font-medium ${
                        money.netProfit < 0 ? "text-danger" : "text-positive"
                      }`}
                    >
                      {formatSignedCurrency(money.netProfit)}
                    </p>
                  </div>
                </div>
                {refundSummary(order) !== "—" ? (
                  <p className="mt-1.5 text-[11px] text-ink-mute">
                    {refundSummary(order)}
                  </p>
                ) : null}

                {order.providerErrorCode || order.providerError ? (
                  <div className="mt-2 space-y-1">
                    {order.providerErrorCode ? (
                      <span className="status status-danger">
                        {order.providerErrorCode}
                      </span>
                    ) : null}
                    {order.providerError ? (
                      <p className="line-clamp-2 text-[10.5px] text-danger">
                        {order.providerError}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <p className="text-[10.5px] text-ink-mute">
                    {timestampToDate(order.createdAt)}
                  </p>
                  {needsProviderReview(order) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      leadingIcon={<Icon name="shield" size={13} />}
                      onClick={() => setResolving(order)}
                    >
                      Resolve
                    </Button>
                  ) : null}
                </div>
              </article>
              );
            })}
          </div>

          {visibleOrders.length > MAX_ROWS ? (
            <p className="border-t border-line bg-subtle px-4 py-2 text-[11px] text-ink-mute">
              Showing the first {MAX_ROWS} of {formatNumber(visibleOrders.length)}.
              Narrow the search to inspect the rest.
            </p>
          ) : null}
        </div>
      )}

      {resolving ? (
        <ResolveOrderDialog
          order={resolving}
          onClose={() => setResolving(null)}
          onResolved={handleResolved}
        />
      ) : null}

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

// ============================================================
// Resolution dialog
// ============================================================

type ResolutionStep = "menu" | "confirm_refund" | "attach_provider";

function ResolveOrderDialog({
  order,
  onClose,
  onResolved,
}: {
  order: OrderDoc;
  onClose: () => void;
  onResolved: (message: string, type: "success" | "info") => void;
}) {
  const [step, setStep] = useState<ResolutionStep>("menu");
  const [providerOrderId, setProviderOrderId] = useState(
    order.providerOrderId ?? ""
  );
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refundableAmount = remainingRefund(order);
  const fullyRefunded =
    order.refundState === "refunded_to_user" && refundableAmount <= 0;
  const providerIdValid = PROVIDER_ORDER_ID_PATTERN.test(providerOrderId.trim());

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (step === "attach_provider") {
      inputRef.current?.focus();
    } else {
      closeRef.current?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isBusy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
      previousFocus?.focus();
    };
  }, [step, isBusy, onClose]);

  async function runAction(
    action: "refund_cancel" | "attach_provider" | "dismiss_review"
  ) {
    if (isBusy) return;

    setIsBusy(true);
    setError(null);

    try {
      const result = await postResolution(
        order.id,
        action,
        action === "attach_provider" ? providerOrderId.trim() : undefined
      );

      if (action === "refund_cancel") {
        if (result.alreadyResolved) {
          onResolved("This order was already fully refunded.", "info");
        } else {
          onResolved(
            `Refunded ${formatCurrency(
              Number(result.refundedAmount ?? refundableAmount)
            )} and canceled the order.`,
            "success"
          );
        }
        return;
      }

      if (action === "attach_provider") {
        onResolved(
          `Provider order ${providerOrderId.trim()} linked. Sync will track it.`,
          "success"
        );
        return;
      }

      onResolved("Review flag cleared.", "success");
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The resolution action failed."
      );
      setIsBusy(false);
    }
  }

  const body = createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink/35"
        aria-label="Close resolution dialog"
        onClick={() => {
          if (!isBusy) onClose();
        }}
        tabIndex={-1}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resolve-order-title"
        className="relative w-full max-w-md rounded-md border border-line-strong bg-surface p-5 shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="rule-label">Order review</p>
            <h2
              id="resolve-order-title"
              className="mt-1 text-[14px] font-semibold text-ink"
            >
              Resolve {order.providerOrderId ?? order.id.slice(0, 10)}
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
              {order.serviceName || `Service ${order.serviceId}`} ·{" "}
              <span className="num-sm">
                {formatCurrency(Number(order.charge ?? 0))}
              </span>{" "}
              charged
            </p>
          </div>
          <Button
            ref={closeRef}
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close"
          >
            <Icon name="x" size={14} />
          </Button>
        </div>

        {error ? (
          <div className="mt-4">
            <Notice tone="danger">{error}</Notice>
          </div>
        ) : null}

        {step === "menu" ? (
          <div className="mt-4 space-y-2.5">
            {order.needsReconciliation && !fullyRefunded ? (
              <div className="rounded-[var(--radius-sm)] border border-line bg-subtle p-3">
                <p className="text-[12.5px] font-medium text-ink">
                  Attach provider order
                </p>
                <p className="mt-0.5 text-[11.5px] leading-5 text-ink-mute">
                  Use this when the provider accepted the order but the response
                  was lost. The order returns to sync tracking.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2.5"
                  onClick={() => setStep("attach_provider")}
                  disabled={isBusy}
                >
                  Attach provider ID
                </Button>
              </div>
            ) : null}

            {!fullyRefunded ? (
              <div className="rounded-[var(--radius-sm)] border border-[#eec9c5] bg-danger-soft/40 p-3">
                <p className="text-[12.5px] font-medium text-ink">
                  Refund &amp; mark canceled
                </p>
                <p className="mt-0.5 text-[11.5px] leading-5 text-ink-mute">
                  Credits{" "}
                  <span className="num-sm font-medium text-ink">
                    {formatCurrency(refundableAmount)}
                  </span>{" "}
                  to the customer wallet and closes the order.
                </p>
                <Button
                  variant="danger-solid"
                  size="sm"
                  className="mt-2.5"
                  onClick={() => setStep("confirm_refund")}
                  disabled={isBusy}
                >
                  Refund and cancel
                </Button>
              </div>
            ) : (
              <Notice tone="positive">
                This order is already fully refunded. No further credit is due.
              </Notice>
            )}

            {order.needsReconciliation ? (
              <div className="rounded-[var(--radius-sm)] border border-line bg-subtle p-3">
                <p className="text-[12.5px] font-medium text-ink">
                  Dismiss review flag
                </p>
                <p className="mt-0.5 text-[11.5px] leading-5 text-ink-mute">
                  Keep the order as-is and clear the manual review flag.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2.5"
                  onClick={() => runAction("dismiss_review")}
                  isLoading={isBusy}
                >
                  Dismiss flag
                </Button>
              </div>
            ) : null}

            <p className="pt-1 text-[11px] leading-5 text-ink-mute">
              Current refund state: {refundSummary(order)}. Every action is
              written transactionally and recorded against your admin account.
            </p>
          </div>
        ) : step === "confirm_refund" ? (
          <div className="mt-4">
            <Notice tone="warning">
              This credits{" "}
              <span className="num-sm font-medium">
                {formatCurrency(refundableAmount)}
              </span>{" "}
              to {order.userEmail || "the customer"} and marks the order canceled.
              It cannot be undone from this screen.
            </Notice>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStep("menu")}
                disabled={isBusy}
              >
                Back
              </Button>
              <Button
                variant="danger-solid"
                size="sm"
                onClick={() => runAction("refund_cancel")}
                isLoading={isBusy}
              >
                Confirm refund
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Input
              ref={inputRef}
              label="Provider order ID"
              value={providerOrderId}
              onChange={(event) => setProviderOrderId(event.target.value)}
              placeholder="e.g. 123456789"
              hint="Copy the order ID from the provider panel. Letters, digits, dash, or underscore."
              error={
                providerOrderId.trim() && !providerIdValid
                  ? "That is not a valid provider order ID."
                  : undefined
              }
              disabled={isBusy}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStep("menu")}
                disabled={isBusy}
              >
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => runAction("attach_provider")}
                isLoading={isBusy}
                disabled={!providerIdValid}
              >
                Link and activate
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );

  return body;
}

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
import {
  getServiceDisplayCategory,
  getServiceDisplayName,
} from "@/lib/services";
import {
  localizeErrorCode,
  localizeRefundAnomaly,
  providerMessageForCode,
  translateErrorMessage,
} from "@/lib/error-messages";

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

function refundSummary(
  order: OrderDoc,
  t: (en: string, ar: string) => string
): string {
  if (order.refundAnomaly) {
    return t("Anomaly", "حالة شاذة");
  }

  if (order.refundState === "refunded_to_user") {
    return order.refundedAmount !== undefined
      ? t(
          `${formatCurrency(order.refundedAmount)} refunded`,
          `تم استرداد ${formatCurrency(order.refundedAmount)}`
        )
      : t("Refunded", "مسترد");
  }

  if (order.refundState === "partially_refunded") {
    return order.refundedAmount !== undefined
      ? t(
          `${formatCurrency(order.refundedAmount)} partial`,
          `استرداد جزئي ${formatCurrency(order.refundedAmount)}`
        )
      : t("Partial refund", "استرداد جزئي");
  }

  if (order.refundState === "awaiting_provider_refund") {
    return t("Awaiting provider", "بانتظار المزود");
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
  const { language, t } = useLanguage();
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
      ? t("Unavailable", "غير متاح")
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
        language === "ar" && order.serviceName
          ? getServiceDisplayName({ name: order.serviceName }, language)
          : "",
      ].some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [orders, tab, query, language]);

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
              ? translateErrorMessage(provider.error, language)
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
          message={translateErrorMessage(loadError, language)}
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
                      <p
                        className="mt-0.5 text-[10.5px] text-ink-mute"
                        data-i18n-ignore
                      >
                        {t("Local", "محلي")} {order.id.slice(0, 10)}
                      </p>
                    </td>
                    <td>
                      <p className="max-w-[190px] truncate text-[12px] text-ink" data-i18n-ignore>
                        {order.userEmail || order.userId}
                      </p>
                    </td>
                    <td>
                      <p className="cell-strong max-w-[220px] truncate">
                        {order.serviceName
                          ? language === "ar"
                            ? getServiceDisplayName(
                                { name: order.serviceName },
                                language
                              )
                            : order.serviceName
                          : t("Service", "خدمة")}{" "}
                        {order.serviceName ? "" : order.serviceId}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-mute">
                        {order.category
                          ? language === "ar"
                            ? getServiceDisplayCategory(
                                { category: order.category },
                                language
                              )
                            : order.category
                          : t("Uncategorized", "غير مصنف")}
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
                            {t("Under review", "قيد المراجعة")}
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
                          {refundSummary(order, t)}
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
                              {localizeErrorCode(order.providerErrorCode, language)}
                            </span>
                          ) : null}
                          {order.providerError ? (
                            <p
                              className="truncate text-[10.5px] text-danger"
                              title={translateErrorMessage(
                                order.providerError,
                                language
                              )}
                            >
                              {providerMessageForCode(
                                order.providerErrorCode,
                                language
                              ) ??
                                translateErrorMessage(
                                  order.providerError,
                                  language
                                )}
                            </p>
                          ) : null}
                          {order.refundAnomaly ? (
                            <p
                              className="truncate text-[10.5px] text-warning"
                              title={localizeRefundAnomaly(
                                order.refundAnomaly,
                                language
                              )}
                            >
                              {localizeRefundAnomaly(
                                order.refundAnomaly,
                                language
                              )}
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
                          {t("Resolve", "معالجة")}
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
                      {order.serviceName
                        ? language === "ar"
                          ? getServiceDisplayName(
                              { name: order.serviceName },
                              language
                            )
                          : order.serviceName
                        : t("Service", "خدمة")}{" "}
                      {order.serviceName ? "" : order.serviceId}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[11px] text-ink-mute"
                      data-i18n-ignore
                    >
                      {order.userEmail || order.userId}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 border-y border-line py-2">
                  <div>
                    <p className="rule-label">{t("Charge", "المبلغ")}</p>
                    <p className="num-sm mt-1 font-medium text-ink">
                      {formatCurrency(Number(order.charge ?? 0))}
                    </p>
                  </div>
                  <div>
                    <p className="rule-label">{t("Provider cost", "تكلفة المزود")}</p>
                    <p className="num-sm mt-1 text-ink">
                      {formatCurrency(money.providerCost)}
                    </p>
                  </div>
                  <div>
                    <p className="rule-label">{t("Net profit", "صافي الربح")}</p>
                    <p
                      className={`num-sm mt-1 font-medium ${
                        money.netProfit < 0 ? "text-danger" : "text-positive"
                      }`}
                    >
                      {formatSignedCurrency(money.netProfit)}
                    </p>
                  </div>
                </div>
                {refundSummary(order, t) !== "—" ? (
                  <p className="mt-1.5 text-[11px] text-ink-mute">
                    {refundSummary(order, t)}
                  </p>
                ) : null}

                {order.providerErrorCode || order.providerError ? (
                  <div className="mt-2 space-y-1">
                    {order.providerErrorCode ? (
                      <span className="status status-danger">
                        {localizeErrorCode(order.providerErrorCode, language)}
                      </span>
                    ) : null}
                    {order.providerError ? (
                      <p className="line-clamp-2 text-[10.5px] text-danger">
                        {providerMessageForCode(
                          order.providerErrorCode,
                          language
                        ) ??
                          translateErrorMessage(order.providerError, language)}
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
                      {t("Resolve", "معالجة")}
                    </Button>
                  ) : null}
                </div>
              </article>
              );
            })}
          </div>

          {visibleOrders.length > MAX_ROWS ? (
            <p className="border-t border-line bg-subtle px-4 py-2 text-[11px] text-ink-mute">
              {t(
                `Showing the first ${MAX_ROWS} of ${formatNumber(
                  visibleOrders.length
                )}. Narrow the search to inspect the rest.`,
                `يتم عرض أول ${MAX_ROWS} من ${formatNumber(
                  visibleOrders.length
                )}. ضيّق البحث لعرض الباقي.`
              )}
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
  const { language, t } = useLanguage();
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
          onResolved(
            t(
              "This order was already fully refunded.",
              "تم استرداد هذا الطلب بالكامل مسبقًا."
            ),
            "info"
          );
        } else {
          onResolved(
            t(
              `Refunded ${formatCurrency(
                Number(result.refundedAmount ?? refundableAmount)
              )} and canceled the order.`,
              `تم استرداد ${formatCurrency(
                Number(result.refundedAmount ?? refundableAmount)
              )} وإلغاء الطلب.`
            ),
            "success"
          );
        }
        return;
      }

      if (action === "attach_provider") {
        onResolved(
          t(
            `Provider order ${providerOrderId.trim()} linked. Sync will track it.`,
            `تم ربط طلب المزود ${providerOrderId.trim()}. ستتابعه المزامنة.`
          ),
          "success"
        );
        return;
      }

      onResolved(t("Review flag cleared.", "تم مسح علامة المراجعة."), "success");
    } catch (actionError) {
      setError(
        translateErrorMessage(
          actionError instanceof Error
            ? actionError.message
            : "The resolution action failed.",
          language
        )
      );
      setIsBusy(false);
    }
  }

  const body = createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink/35"
        aria-label={t("Close resolution dialog", "إغلاق نافذة المعالجة")}
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
            <p className="rule-label">{t("Order review", "مراجعة الطلب")}</p>
            <h2
              id="resolve-order-title"
              className="mt-1 text-[14px] font-semibold text-ink"
            >
              {t("Resolve", "معالجة")}{" "}
              {order.providerOrderId ?? order.id.slice(0, 10)}
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
              {order.serviceName
                ? language === "ar"
                  ? getServiceDisplayName({ name: order.serviceName }, language)
                  : order.serviceName
                : t("Service", "خدمة")}{" "}
              {order.serviceName ? "" : order.serviceId} ·{" "}
              <span className="num-sm">
                {formatCurrency(Number(order.charge ?? 0))}
              </span>{" "}
              {t("charged", "تم خصمها")}
            </p>
          </div>
          <Button
            ref={closeRef}
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isBusy}
            aria-label={t("Close", "إغلاق")}
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
                  {t("Attach provider order", "ربط طلب المزود")}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-5 text-ink-mute">
                  {t(
                    "Use this when the provider accepted the order but the response was lost. The order returns to sync tracking.",
                    "استخدم هذا عندما يقبل المزود الطلب لكن تضيع الاستجابة. يعود الطلب إلى متابعة المزامنة."
                  )}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2.5"
                  onClick={() => setStep("attach_provider")}
                  disabled={isBusy}
                >
                  {t("Attach provider ID", "ربط معرف المزود")}
                </Button>
              </div>
            ) : null}

            {!fullyRefunded ? (
              <div className="rounded-[var(--radius-sm)] border border-[#eec9c5] bg-danger-soft/40 p-3">
                <p className="text-[12.5px] font-medium text-ink">
                  {t("Refund & mark canceled", "استرداد وإلغاء الطلب")}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-5 text-ink-mute">
                  {t("Credits", "إضافة")}{" "}
                  <span className="num-sm font-medium text-ink">
                    {formatCurrency(refundableAmount)}
                  </span>{" "}
                  {t(
                    "to the customer wallet and closes the order.",
                    "إلى محفظة العميل وإغلاق الطلب."
                  )}
                </p>
                <Button
                  variant="danger-solid"
                  size="sm"
                  className="mt-2.5"
                  onClick={() => setStep("confirm_refund")}
                  disabled={isBusy}
                >
                  {t("Refund and cancel", "استرداد وإلغاء")}
                </Button>
              </div>
            ) : (
              <Notice tone="positive">
                {t(
                  "This order is already fully refunded. No further credit is due.",
                  "تم استرداد هذا الطلب بالكامل. لا يوجد رصيد إضافي مستحق."
                )}
              </Notice>
            )}

            {order.needsReconciliation ? (
              <div className="rounded-[var(--radius-sm)] border border-line bg-subtle p-3">
                <p className="text-[12.5px] font-medium text-ink">
                  {t("Dismiss review flag", "مسح علامة المراجعة")}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-5 text-ink-mute">
                  {t(
                    "Keep the order as-is and clear the manual review flag.",
                    "أبقِ الطلب كما هو وامسح علامة المراجعة اليدوية."
                  )}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2.5"
                  onClick={() => runAction("dismiss_review")}
                  isLoading={isBusy}
                >
                  {t("Dismiss flag", "مسح العلامة")}
                </Button>
              </div>
            ) : null}

            <p className="pt-1 text-[11px] leading-5 text-ink-mute">
              {t("Current refund state:", "حالة الاسترداد الحالية:")}{" "}
              {refundSummary(order, t)}.{" "}
              {t(
                "Every action is written transactionally and recorded against your admin account.",
                "يُسجّل كل إجراء في معاملة ويُربط بحساب المدير."
              )}
            </p>
          </div>
        ) : step === "confirm_refund" ? (
          <div className="mt-4">
            <Notice tone="warning">
              {t("This credits", "سيتم إضافة")}{" "}
              <span className="num-sm font-medium">
                {formatCurrency(refundableAmount)}
              </span>{" "}
              {t("to", "إلى")} {order.userEmail || t("the customer", "العميل")}{" "}
              {t(
                "and marks the order canceled. It cannot be undone from this screen.",
                "وإلغاء الطلب. لا يمكن التراجع من هذه الشاشة."
              )}
            </Notice>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStep("menu")}
                disabled={isBusy}
              >
                {t("Back", "رجوع")}
              </Button>
              <Button
                variant="danger-solid"
                size="sm"
                onClick={() => runAction("refund_cancel")}
                isLoading={isBusy}
              >
                {t("Confirm refund", "تأكيد الاسترداد")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Input
              ref={inputRef}
              label={t("Provider order ID", "معرف طلب المزود")}
              value={providerOrderId}
              onChange={(event) => setProviderOrderId(event.target.value)}
              placeholder={t("e.g. 123456789", "مثال: 123456789")}
              hint={t(
                "Copy the order ID from the provider panel. Letters, digits, dash, or underscore.",
                "انسخ معرف الطلب من لوحة المزود. أحرف أو أرقام أو شرطة أو شرطة سفلية."
              )}
              error={
                providerOrderId.trim() && !providerIdValid
                  ? t(
                      "That is not a valid provider order ID.",
                      "معرف طلب المزود غير صالح."
                    )
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
                {t("Back", "رجوع")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => runAction("attach_provider")}
                isLoading={isBusy}
                disabled={!providerIdValid}
              >
                {t("Link and activate", "ربط وتفعيل")}
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

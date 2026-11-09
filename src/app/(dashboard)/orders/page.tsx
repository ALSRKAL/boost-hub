"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import Toast, { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import SearchInput from "@/components/ui/SearchInput";
import Tabs from "@/components/ui/Tabs";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { StatusBadge } from "@/components/ui/Badge";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonRows,
} from "@/components/ui/Primitives";
import { formatCurrency, formatDate, formatNumber } from "@/lib/constants";
import { subscribeUserOrders, type OrderDoc } from "@/lib/db";
import { formatCountdown, getRefillState } from "@/lib/refill-utils";

type OrderTab =
  | "all"
  | "pending"
  | "in_progress"
  | "completed"
  | "partial"
  | "cancelled";

const ACTIVE_STATUSES = new Set<OrderDoc["status"]>([
  "pending",
  "processing",
  "in_progress",
]);

const TABS: Array<{ key: OrderTab; label: string; labelAr: string }> = [
  { key: "all", label: "All", labelAr: "الكل" },
  { key: "pending", label: "Pending", labelAr: "قيد الانتظار" },
  { key: "in_progress", label: "In progress", labelAr: "قيد التنفيذ" },
  { key: "completed", label: "Completed", labelAr: "مكتمل" },
  { key: "partial", label: "Partial", labelAr: "جزئي" },
  { key: "cancelled", label: "Canceled / failed", labelAr: "ملغي / فاشل" },
];

function matchesTab(order: OrderDoc, tab: OrderTab): boolean {
  if (tab === "all") return true;
  if (tab === "cancelled") {
    return order.status === "cancelled" || order.status === "failed";
  }
  if (tab === "in_progress") {
    return order.status === "in_progress" || order.status === "processing";
  }
  return order.status === tab;
}

function matchesSearch(order: OrderDoc, query: string): boolean {
  if (!query) return true;

  return [
    order.id,
    order.providerOrderId,
    order.serviceId,
    order.serviceName,
    order.category,
    order.link,
    order.status,
    order.refundState,
    String(order.quantity),
  ].some((value) => String(value ?? "").toLowerCase().includes(query));
}

function refundNote(
  order: OrderDoc,
  t: (en: string, ar: string) => string
): string | null {
  if (order.needsReconciliation) {
    return t(
      "Provider confirmation pending · under review",
      "بانتظار تأكيد المزود · قيد المراجعة"
    );
  }

  if (order.refundState === "partially_refunded") {
    const amount =
      typeof order.refundedAmount === "number"
        ? formatCurrency(order.refundedAmount)
        : t("Unused quantity", "كمية غير مستخدمة");
    const date = order.refundedToUserAt
      ? formatDate(order.refundedToUserAt.toDate())
      : null;

    return date
      ? t(
          `${amount} partially refunded · ${date}`,
          `تم استرداد ${amount} جزئيًا · ${date}`
        )
      : t(`${amount} partially refunded`, `تم استرداد ${amount} جزئيًا`);
  }

  if (order.refundAnomaly) {
    return t(
      "Refund calculation under review",
      "حساب الاسترداد قيد المراجعة"
    );
  }

  if (order.refundState === "refunded_to_user") {
    const amount =
      typeof order.refundedAmount === "number"
        ? formatCurrency(order.refundedAmount)
        : t("Charge", "المبلغ");
    const date = order.refundedToUserAt
      ? formatDate(order.refundedToUserAt.toDate())
      : null;

    return date
      ? t(`${amount} refunded · ${date}`, `تم استرداد ${amount} · ${date}`)
      : t(`${amount} refunded`, `تم استرداد ${amount}`);
  }

  if (order.refundState === "awaiting_provider_refund") {
    return t("Awaiting provider refund", "بانتظار استرداد المزود");
  }

  if (order.cancelErrorMessage) return order.cancelErrorMessage;
  if (order.refillErrorMessage) return order.refillErrorMessage;

  return null;
}

function readErrorMessage(payload: unknown): string | null {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return null;
}

export default function OrdersPage() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { toasts, addToast, removeToast } = useToast();

  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<OrderTab>("all");
  const [refillingId, setRefillingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderDoc | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const deferredSearch = useDeferredValue(search);
  const query = deferredSearch.trim().toLowerCase();

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const userId = user?.uid;

    if (!userId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    let receivedInitial = false;

    const unsubscribe = subscribeUserOrders(
      userId,
      (nextOrders) => {
        setOrders(nextOrders);
        if (!receivedInitial) {
          receivedInitial = true;
          setLoading(false);
        }
      },
      (loadError) => {
        console.error("Failed to load orders:", loadError);
        setError("Your orders could not be loaded.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user?.uid, reloadKey]);

  const counts = useMemo(() => {
    const byTab = Object.fromEntries(
      TABS.map((item) => [
        item.key,
        orders.filter((order) => matchesTab(order, item.key)).length,
      ])
    ) as Record<OrderTab, number>;

    return byTab;
  }, [orders]);

  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (order) => matchesTab(order, tab) && matchesSearch(order, query)
      ),
    [orders, tab, query]
  );

  const handleRefill = useCallback(
    async (order: OrderDoc) => {
      if (!user?.uid || refillingId) return;

      try {
        setRefillingId(order.id);
        const token = await user.getIdToken();
        const response = await fetch("/api/order/refill", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId: order.id, userId: user.uid }),
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(readErrorMessage(payload) ?? "The refill was rejected.");
        }

        const pendingConfirmation =
          payload &&
          typeof payload === "object" &&
          "pendingConfirmation" in payload &&
          payload.pendingConfirmation === true;
        const responseMessage =
          payload &&
          typeof payload === "object" &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : null;

        setOrders((current) =>
          current.map((item) =>
            item.id === order.id
              ? {
                  ...item,
                  refillStatus: "requested",
                  refillCount: (item.refillCount ?? 0) + 1,
                  refillRequestedAt: Timestamp.now(),
                  ...(pendingConfirmation ? { needsReconciliation: true } : {}),
                }
              : item
          )
        );

        const note =
          payload &&
          typeof payload === "object" &&
          "note" in payload &&
          typeof payload.note === "string"
            ? payload.note
            : pendingConfirmation
              ? responseMessage ?? "Refill confirmation pending."
              : "Refill requested.";
        addToast(note, pendingConfirmation ? "info" : "success");
      } catch (refillError) {
        console.error("Failed to request refill:", refillError);
        addToast(
          refillError instanceof Error
            ? refillError.message
            : "The refill was rejected.",
          "error"
        );
      } finally {
        setRefillingId(null);
      }
    },
    [user, refillingId, addToast]
  );

  async function handleCancel() {
    if (!cancelTarget || !user?.uid || cancellingId) return;

    const order = cancelTarget;

    try {
      setCancellingId(order.id);
      const token = await user.getIdToken();
      const response = await fetch("/api/order/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId: order.id, userId: user.uid }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          readErrorMessage(payload) ?? "The cancellation was rejected."
        );
      }

      const pendingConfirmation =
        payload &&
        typeof payload === "object" &&
        "pendingConfirmation" in payload &&
        payload.pendingConfirmation === true;
      const responseMessage =
        payload &&
        typeof payload === "object" &&
        "message" in payload &&
        typeof payload.message === "string"
          ? payload.message
          : null;

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? pendingConfirmation
              ? {
                  ...item,
                  cancelRequestedAt: Timestamp.now(),
                  providerLastStatus: "cancel_unknown",
                  needsReconciliation: true,
                }
              : {
                  ...item,
                  status: "cancelled",
                  refundState: "awaiting_provider_refund",
                  cancelRequestedAt: Timestamp.now(),
                  needsReconciliation: false,
                }
            : item
        )
      );

      addToast(
        pendingConfirmation
          ? responseMessage ?? "Cancellation confirmation pending."
          : "Cancellation requested. The refund is credited after provider confirmation.",
        "info"
      );
      setCancelTarget(null);
    } catch (cancelError) {
      console.error("Failed to cancel order:", cancelError);
      addToast(
        cancelError instanceof Error
          ? cancelError.message
          : "The cancellation was rejected.",
        "error"
      );
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Toast toasts={toasts} onRemove={removeToast} />

      <PageHeader
        eyebrow={t("Ledger", "السجل")}
        title={t("Orders", "الطلبات")}
        description={t(
          "Every charge, provider reference, refund, and refill window for this account.",
          "كل خصم ومرجع مزود واسترداد ونافذة تعويض لهذا الحساب."
        )}
        actions={
          <span className="num-sm text-ink-mute">
            {t(
              `${formatNumber(orders.length)} total`,
              `${formatNumber(orders.length)} إجمالي`
            )}
          </span>
        }
      />

      <StatusGuide />

      <div className="space-y-3">
        <SearchInput
          label={t("Search orders", "بحث في الطلبات")}
          value={search}
          onChange={setSearch}
          placeholder={t(
            "Search by order ID, provider ID, link, or service",
            "ابحث بمعرف الطلب أو معرف المزود أو الرابط أو الخدمة"
          )}
        />

        <div className="panel px-2 pt-1">
          <Tabs
            items={TABS.map((item) => ({
              key: item.key,
              label: language === "ar" ? item.labelAr : item.label,
              count: counts[item.key],
            }))}
            value={tab}
            onChange={setTab}
            label={t("Order status", "حالة الطلب")}
          />
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : error ? (
        <ErrorState
          title={t("Orders unavailable", "الطلبات غير متاحة")}
          message={error}
          onRetry={() => {
            setLoading(true);
            setError(null);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : orders.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={t("No orders yet", "لا توجد طلبات بعد")}
          description={t(
            "Place an order from the catalog and it will appear here with its live provider status.",
            "أنشئ طلبًا من الكتالوج وسيظهر هنا مع حالة المزود المباشرة."
          )}
          action={
            <Link href="/new-order" className="btn btn-primary btn-sm">
              <Icon name="plus" size={14} />
              {t("New order", "طلب جديد")}
            </Link>
          }
        />
      ) : visibleOrders.length === 0 ? (
        <EmptyState
          icon="search"
          title={t("No orders match", "لا توجد طلبات مطابقة")}
          description={t(
            "Change the status tab or clear the search to see the rest of the ledger.",
            "غيّر تبويب الحالة أو امسح البحث لعرض بقية السجل."
          )}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearch("");
                setTab("all");
              }}
            >
              {t("Clear filters", "مسح عوامل التصفية")}
            </Button>
          }
        />
      ) : (
        <section className="panel overflow-hidden">
          <div className="scroll-x hidden lg:block">
            <table className="data-table min-w-[1080px]">
              <thead>
                <tr>
                  <th>{t("Order", "الطلب")}</th>
                  <th>{t("Service", "الخدمة")}</th>
                  <th>{t("Target", "الهدف")}</th>
                  <th className="cell-end">{t("Quantity", "الكمية")}</th>
                  <th className="cell-end">{t("Charge", "المبلغ")}</th>
                  <th>{t("Placed", "التاريخ")}</th>
                  <th>{t("Status", "الحالة")}</th>
                  <th className="cell-end">{t("Actions", "الإجراءات")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <span className="num-sm text-ink">
                        {order.providerOrderId ?? order.id.slice(0, 10)}
                      </span>
                      <p className="mt-0.5 text-[10.5px] text-ink-mute">
                        {t("Local", "محلي")} {order.id.slice(0, 10)}
                      </p>
                    </td>
                    <td>
                      <p className="cell-strong max-w-[260px] leading-5">
                        {order.serviceName || `Service ${order.serviceId}`}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-ink-mute">
                        {order.category || t("Uncategorized", "غير مصنف")}
                        {order.runs
                          ? ` · ${order.runs} ${t("runs", "دفعة")}`
                          : ""}
                        {order.comments ? ` · ${t("comments", "تعليقات")}` : ""}
                      </p>
                    </td>
                    <td>
                      <a
                        href={order.link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex max-w-[240px] items-center gap-1 text-[12px] text-accent hover:underline"
                        title={order.link}
                      >
                        <span className="truncate">{order.link}</span>
                        <Icon name="external" size={11} className="shrink-0" />
                      </a>
                    </td>
                    <td className="cell-end cell-num">
                      {formatNumber(order.quantity)}
                    </td>
                    <td className="cell-end cell-num">
                      {formatCurrency(Number(order.charge ?? 0))}
                    </td>
                    <td className="cell-date whitespace-nowrap text-[12px]">
                      {formatDate(order.createdAt?.toDate?.() ?? null)}
                    </td>
                    <td>
                      <div className="space-y-1">
                        <StatusBadge status={order.status} />
                        {refundNote(order, t) ? (
                          <p className="text-[10.5px] text-ink-mute">
                            {refundNote(order, t)}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="cell-end">
                      <RowActions
                        order={order}
                        nowMs={nowMs}
                        refillingId={refillingId}
                        onRefill={handleRefill}
                        onCancel={() => setCancelTarget(order)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-line lg:hidden">
            {visibleOrders.map((order) => (
              <article key={order.id} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="num-sm text-[11.5px] text-ink">
                      {order.providerOrderId ?? order.id.slice(0, 10)}
                    </p>
                    <p className="mt-1 text-[13px] font-medium leading-5 text-ink">
                      {order.serviceName || `Service ${order.serviceId}`}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-mute">
                      {order.category || t("Uncategorized", "غير مصنف")}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <a
                  href={order.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-center gap-1 text-[12px] text-accent"
                >
                  <span className="truncate">{order.link}</span>
                  <Icon name="external" size={11} className="shrink-0" />
                </a>

                <dl className="mt-2.5 grid grid-cols-3 gap-2 border-y border-line py-2 text-[11.5px]">
                  <div>
                    <dt className="text-ink-mute">{t("Quantity", "الكمية")}</dt>
                    <dd className="num-sm mt-0.5 text-ink">
                      {formatNumber(order.quantity)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-mute">{t("Charge", "المبلغ")}</dt>
                    <dd className="num-sm mt-0.5 font-medium text-ink">
                      {formatCurrency(Number(order.charge ?? 0))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-mute">{t("Placed", "التاريخ")}</dt>
                    <dd className="cell-date mt-0.5 text-ink">
                      {formatDate(order.createdAt?.toDate?.() ?? null)}
                    </dd>
                  </div>
                </dl>

                {refundNote(order, t) ? (
                  <p className="mt-2 text-[11px] text-ink-mute">
                    {refundNote(order, t)}
                  </p>
                ) : null}

                <div className="mt-2.5">
                  <RowActions
                    order={order}
                    nowMs={nowMs}
                    refillingId={refillingId}
                    onRefill={handleRefill}
                    onCancel={() => setCancelTarget(order)}
                    fullWidth
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        title={t("Cancel this order?", "إلغاء هذا الطلب؟")}
        description={
          cancelTarget ? (
            <>
              {t(
                "The provider receives a cancellation request for",
                "يتلقى المزود طلب إلغاء للطلب"
              )}{" "}
              <span className="num-sm font-medium text-ink">
                {cancelTarget.providerOrderId ?? cancelTarget.id.slice(0, 10)}
              </span>
              .{" "}
              {t(
                "The charge is refunded only after the provider confirms the cancellation.",
                "لا يُسترد المبلغ إلا بعد تأكيد المزود للإلغاء."
              )}{" "}
              <span className="num-sm font-medium text-ink">
                {formatCurrency(Number(cancelTarget.charge ?? 0))}
              </span>
            </>
          ) : null
        }
        confirmLabel={t("Request cancellation", "طلب الإلغاء")}
        tone="danger"
        isBusy={cancellingId !== null}
        onConfirm={handleCancel}
        onCancel={() => {
          if (!cancellingId) setCancelTarget(null);
        }}
      />
    </div>
  );
}

function StatusGuide() {
  const { t } = useLanguage();

  const items: Array<{ badge: ReactNode; text: string }> = [
    {
      badge: <StatusBadge status="pending" />,
      text: t(
        "Order received. The provider has not started delivery yet. Keep the account and content public.",
        "تم استلام الطلب. لم يبدأ المزود التنفيذ بعد. أبقِ الحساب والمحتوى عامًا."
      ),
    },
    {
      badge: <StatusBadge status="in_progress" />,
      text: t(
        "Delivery has started. Do not change the username, delete the post, or order the same link again.",
        "بدأ التنفيذ. لا تغيّر اسم المستخدم أو تحذف المنشور أو تطلب نفس الرابط مرة أخرى."
      ),
    },
    {
      badge: <StatusBadge status="partial" />,
      text: t(
        "Only part of the quantity was delivered. The unused units are refunded automatically to your wallet in proportion to the quantity.",
        "تم تسليم جزء من الكمية فقط. تُسترد الوحدات غير المستخدمة تلقائيًا إلى محفظتك بنسبة الكمية."
      ),
    },
    {
      badge: <StatusBadge status="completed" />,
      text: t(
        "The full quantity was delivered. The refill window, when included, starts at completion.",
        "تم تسليم الكمية كاملة. تبدأ نافذة التعويض، عند توفرها، من وقت الاكتمال."
      ),
    },
    {
      badge: (
        <span className="status status-warning">
          {t("Awaiting provider refund", "بانتظار استرداد المزود")}
        </span>
      ),
      text: t(
        "Cancellation was sent to the provider. The charge returns to your wallet automatically once the provider confirms.",
        "تم إرسال الإلغاء إلى المزود. يعود المبلغ إلى محفظتك تلقائيًا بمجرد تأكيد المزود."
      ),
    },
    {
      badge: <StatusBadge status="cancelled" />,
      text: t(
        "The order was canceled or failed. Any eligible charge is refunded to your wallet automatically.",
        "تم إلغاء الطلب أو فشله. يُسترد أي مبلغ مستحق إلى محفظتك تلقائيًا."
      ),
    },
  ];

  return (
    <details className="panel group px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
          <Icon name="info" size={14} className="text-ink-mute" />
          {t("What do these statuses mean?", "ماذا تعني هذه الحالات؟")}
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className="shrink-0 text-ink-mute transition-transform group-open:rotate-180"
        />
      </summary>
      <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {items.map((item, index) => (
          <div key={index} className="min-w-0">
            <dt>{item.badge}</dt>
            <dd className="mt-1 text-[11.5px] leading-5 text-ink-mute">
              {item.text}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function RowActions({
  order,
  nowMs,
  refillingId,
  onRefill,
  onCancel,
  fullWidth = false,
}: {
  order: OrderDoc;
  nowMs: number;
  refillingId: string | null;
  onRefill: (order: OrderDoc) => void;
  onCancel: () => void;
  fullWidth?: boolean;
}) {
  const refillState = nowMs > 0 ? getRefillState(order, nowMs) : null;
  const { t } = useLanguage();
  const canCancel =
    Boolean(order.supportsCancel) &&
    ACTIVE_STATUSES.has(order.status) &&
    !order.cancelRequestedAt &&
    order.refundState !== "awaiting_provider_refund";

  return (
    <div
      className={`flex items-center gap-1.5 ${
        fullWidth ? "w-full" : "justify-end"
      }`}
    >
      {refillState === null ? (
        <span className="text-[11px] text-ink-mute">—</span>
      ) : refillState.kind === "available" ? (
        <Button
          variant="secondary"
          size="sm"
          isLoading={refillingId === order.id}
          disabled={refillingId !== null}
          onClick={() => onRefill(order)}
          leadingIcon={<Icon name="refresh" size={12} />}
          className={fullWidth ? "flex-1" : ""}
        >
          {t("Refill", "تعويض")}
        </Button>
      ) : refillState.kind === "waiting" ||
        refillState.kind === "cooldown" ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-ink-mute">
          <Icon name="clock" size={11} />
          {refillState.kind === "cooldown"
            ? t("Next refill ", "التعويض التالي ")
            : t("Refill ", "تعويض ")}
          {formatCountdown(refillState.availableAtMs - nowMs)}
        </span>
      ) : refillState.kind === "expired" ? (
        <span className="text-[11px] text-ink-mute">
          {t("Window expired", "انتهت مدة الضمان")}
        </span>
      ) : refillState.reason === "not-completed" ? (
        <span className="text-[11px] text-ink-mute">
          {t("After completion", "بعد الاكتمال")}
        </span>
      ) : refillState.reason === "inactive" ? (
        <span className="text-[11px] text-ink-mute">
          {t("Not available", "غير متاح")}
        </span>
      ) : (
        <span className="text-[11px] text-ink-mute">—</span>
      )}

      {canCancel ? (
        <Button
          variant="danger"
          size="sm"
          disabled={refillingId !== null}
          onClick={onCancel}
          className={fullWidth ? "flex-1" : ""}
        >
          {t("Cancel", "إلغاء")}
        </Button>
      ) : null}
    </div>
  );
}

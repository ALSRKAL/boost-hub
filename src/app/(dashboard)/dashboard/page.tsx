"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  formatCurrency,
  formatMultiplier,
  formatNumber,
  formatDate,
  formatSignedCurrency,
} from "@/lib/constants";
import {
  subscribeAllDeposits,
  subscribeAllOrders,
  subscribeOrderSyncMetrics,
  subscribeUserOrders,
  timestampToDate,
  type DepositDoc,
  type OrderDoc,
  type OrderSyncMetricDoc,
} from "@/lib/db";
import { sumMoney } from "@/lib/money";
import {
  calculateOrderFinancials,
  summariseOrderFinancials,
} from "@/lib/financials";
import { useAdminProviderInfo } from "@/components/admin/useAdminProviderInfo";
import { useAdminOrderAutoSync } from "@/components/admin/useAdminOrderAutoSync";
import { useOrderAutoSync } from "@/components/orders/useOrderAutoSync";
import { StatusBadge } from "@/components/ui/Badge";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import Toast, { useToast } from "@/components/ui/Toast";
import {
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  SectionHeader,
  SkeletonPanel,
  SkeletonRows,
  Stat,
} from "@/components/ui/Primitives";
import { needsProviderReview } from "@/lib/order-visibility";
import {
  getServiceDisplayCategory,
  getServiceDisplayName,
} from "@/lib/services";
import {
  localizeErrorCode,
  localizeSyncSource,
  translateErrorMessage,
} from "@/lib/error-messages";

const ACTIVE_STATUSES = new Set<OrderDoc["status"]>([
  "pending",
  "processing",
  "in_progress",
]);

const SPENT_STATUSES = new Set<OrderDoc["status"]>([
  "pending",
  "processing",
  "in_progress",
  "completed",
  "partial",
]);

const DEFAULT_PROFIT_MARGIN = 2.25;

function isRefunded(order: OrderDoc): boolean {
  return order.refundState === "refunded_to_user";
}

function displayServiceName(order: OrderDoc, language: "en" | "ar"): string {
  if (!order.serviceName) {
    return language === "ar" ? `خدمة ${order.serviceId}` : `Service ${order.serviceId}`;
  }

  return language === "ar"
    ? getServiceDisplayName({ name: order.serviceName }, language)
    : order.serviceName;
}

function displayServiceCategory(
  order: OrderDoc,
  language: "en" | "ar"
): string {
  if (!order.category) return language === "ar" ? "غير مصنف" : "Uncategorized";

  return language === "ar"
    ? getServiceDisplayCategory({ category: order.category }, language)
    : order.category;
}

export default function DashboardPage() {
  const { user, userProfile } = useAuth();
  const isAdmin = userProfile?.role === "admin";
  const scopeKey = `${user?.uid ?? "guest"}:${isAdmin ? "admin" : "user"}`;

  return (
    <DashboardContent
      key={scopeKey}
      isAdmin={isAdmin}
      userId={user?.uid ?? null}
      balance={Number(userProfile?.balance ?? 0)}
    />
  );
}

function DashboardContent({
  isAdmin,
  userId,
  balance,
}: {
  isAdmin: boolean;
  userId: string | null;
  balance: number;
}) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { toasts, addToast, removeToast } = useToast();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [deposits, setDeposits] = useState<DepositDoc[]>([]);
  const [syncMetrics, setSyncMetrics] = useState<OrderSyncMetricDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const provider = useAdminProviderInfo(isAdmin);
  const [syncing, setSyncing] = useState(false);
  const effectiveMargin = provider.profitMargin ?? DEFAULT_PROFIT_MARGIN;
  const financials = useMemo(
    () => summariseOrderFinancials(orders, effectiveMargin),
    [orders, effectiveMargin]
  );
  const hasSyncableOrders = useMemo(
    () =>
      orders.some(
        (order) =>
          ACTIVE_STATUSES.has(order.status) ||
          order.status === "partial" ||
          order.refundState === "awaiting_provider_refund" ||
          order.needsReconciliation ||
          ((order.status === "cancelled" || order.status === "failed") &&
            order.refundState !== "refunded_to_user")
      ),
    [orders]
  );

  useOrderAutoSync({
    userId: isAdmin ? null : userId,
    enabled: !isAdmin && hasSyncableOrders,
  });
  useAdminOrderAutoSync({
    enabled: isAdmin,
    onSynced: provider.refresh,
  });

  async function handleSyncNow() {
    if (!user || syncing) return;

    try {
      setSyncing(true);
      const token = await user.getIdToken();
      const response = await fetch("/api/cron/sync-orders", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The provider sync failed.";
        throw new Error(message);
      }

      const summary =
        payload && typeof payload === "object" && "summary" in payload
          ? (payload.summary as Record<string, unknown>)
          : null;

      if (summary) {
        const errors = Number(summary.errors ?? 0);
        const anomalies = Number(summary.refundAnomalies ?? 0);
        addToast(
          language === "ar"
            ? `تم فحص ${formatNumber(
                Number(summary.checked ?? 0)
              )} وتحديث ${formatNumber(
                Number(summary.updated ?? 0)
              )} واسترداد ${formatNumber(
                Number(summary.refunded ?? 0)
              )}، مع ${formatNumber(anomalies)} حالة شاذة و${formatNumber(
                Number(summary.awaitingProviderRefund ?? 0)
              )} بانتظار الاسترداد.`
            : `Checked ${formatNumber(
                Number(summary.checked ?? 0)
              )}, updated ${formatNumber(
                Number(summary.updated ?? 0)
              )}, refunded ${formatNumber(
                Number(summary.refunded ?? 0)
              )}, anomalies ${formatNumber(
                anomalies
              )}, awaiting ${formatNumber(
                Number(summary.awaitingProviderRefund ?? 0)
              )}.`,
          errors > 0 ? "error" : "success"
        );
      } else {
        addToast(
          t("Provider sync complete.", "اكتملت مزامنة المزود."),
          "success"
        );
      }

      provider.refresh();
    } catch (syncError) {
      console.error("Failed to sync orders:", syncError);
      addToast(
        translateErrorMessage(
          syncError instanceof Error
            ? syncError.message
            : "The provider sync failed.",
          language
        ),
        "error"
      );
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!isAdmin && !userId) return;

    let ordersReady = false;
    let depositsReady = !isAdmin;
    let active = true;

    function finishIfReady() {
      if (active && ordersReady && depositsReady) setLoading(false);
    }

    const unsubscribers: Array<() => void> = [];

    if (isAdmin) {
      unsubscribers.push(
        subscribeAllOrders(
          (nextOrders) => {
            setOrders(nextOrders);
            ordersReady = true;
            finishIfReady();
          },
          (loadError) => {
            console.error("Failed to load admin orders:", loadError);
            setError("The order ledger could not be loaded.");
            setLoading(false);
          }
        )
      );

      unsubscribers.push(
        subscribeAllDeposits(
          (nextDeposits) => {
            setDeposits(nextDeposits);
            depositsReady = true;
            finishIfReady();
          },
          (loadError) => {
            console.error("Failed to load admin deposits:", loadError);
            setError("The deposit ledger could not be loaded.");
            setLoading(false);
          }
        )
      );

      unsubscribers.push(
        subscribeOrderSyncMetrics(setSyncMetrics, (loadError) => {
          console.error("Failed to load sync metrics:", loadError);
        })
      );
    } else if (userId) {
      unsubscribers.push(
        subscribeUserOrders(
          userId,
          (nextOrders) => {
            setOrders(nextOrders);
            ordersReady = true;
            finishIfReady();
          },
          (loadError) => {
            console.error("Failed to load user orders:", loadError);
            setError("Your orders could not be loaded.");
            setLoading(false);
          }
        )
      );
    }

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [isAdmin, userId, reloadKey]);

  const stats = useMemo(() => {
    const activeOrders = orders.filter((order) => ACTIVE_STATUSES.has(order.status));
    const completedOrders = orders.filter(
      (order) => order.status === "completed" || order.status === "partial"
    );
    const spentOrders = orders.filter(
      (order) => SPENT_STATUSES.has(order.status) && !isRefunded(order)
    );
    const spent = sumMoney(spentOrders.map((order) => Number(order.charge ?? 0)));
    const pendingDeposits = deposits.filter(
      (deposit) => deposit.status === "pending"
    );

    return {
      activeOrders: activeOrders.length,
      completedOrders: completedOrders.length,
      spent,
      pendingDeposits: pendingDeposits.length,
      pendingDepositValue: sumMoney(
        pendingDeposits.map((deposit) => Number(deposit.amount ?? 0))
      ),
    };
  }, [orders, deposits]);

  const recentOrders = orders.slice(0, 7);
  const attentionOrders = useMemo(
    () => orders.filter((order) => needsProviderReview(order)),
    [orders]
  );
  const providerBalanceLabel = provider.loading
    ? "…"
    : provider.balance === null
      ? t("Unavailable", "غير متاح")
      : formatCurrency(provider.balance);

  return (
    <div className="space-y-6">
      <Toast toasts={toasts} onRemove={removeToast} />

      <PageHeader
        eyebrow={isAdmin ? t("Administration", "الإدارة") : t("Account", "الحساب")}
        title={isAdmin ? t("Platform overview", "نظرة عامة على المنصة") : t("Overview", "نظرة عامة")}
        description={
          isAdmin
            ? t(
                "Live provider balance, selling margin, net revenue, and realized profit — computed from the order ledger.",
                "رصيد المزود المباشر وهامش البيع وصافي الإيراد والربح المحقق — محسوبة من سجل الطلبات."
              )
            : t(
                "Your balance, live orders, and recent activity. Prices are per 1,000 units.",
                "رصيدك وطلباتك النشطة ونشاطك الأخير. الأسعار لكل 1000 وحدة."
              )
        }
        actions={
          <>
            <Link href="/add-funds" className="btn btn-secondary btn-sm">
              <Icon name="wallet" size={14} />
              {t("Add funds", "إضافة رصيد")}
            </Link>
            <Link href="/new-order" className="btn btn-primary btn-sm">
              <Icon name="plus" size={14} />
              {t("New order", "طلب جديد")}
            </Link>
          </>
        }
      />

      {error ? (
        <ErrorState
          message={translateErrorMessage(error, language)}
          onRetry={() => {
            setLoading(true);
            setError(null);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}

      {isAdmin ? (
        <>
          <section className="space-y-3">
            <SectionHeader
              title={t("Financials", "المالية")}
              description={t(
                "Realized figures exclude refunded and canceled value. Provider cost is recognized only for delivered and active units.",
                "الأرقام المحققة تستثني المبالغ المستردة والملغاة. تُحتسب تكلفة المزود فقط للوحدات المسلّمة والنشطة."
              )}
            />
            {loading ? (
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <SkeletonPanel key={index} lines={3} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
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
                          `+${formatNumber(
                            provider.profitPercent
                          )}% over provider cost`,
                          `+${formatNumber(
                            provider.profitPercent
                          )}% فوق تكلفة المزود`
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
                <Stat
                  label={t("Provider cost", "تكلفة المزود")}
                  value={formatCurrency(financials.providerCost)}
                  note={t("Delivered and active units", "الوحدات المسلّمة والنشطة")}
                />
                <Stat
                  label={t("Refunded", "المسترد")}
                  value={formatCurrency(financials.refunded)}
                  note={t("Credited back to customers", "أُعيد إلى العملاء")}
                />
                <Stat
                  label={t("Pending deposits", "إيداعات معلقة")}
                  value={formatNumber(stats.pendingDeposits)}
                  tone={stats.pendingDeposits > 0 ? "warning" : "default"}
                  note={t(
                    `${formatCurrency(stats.pendingDepositValue)} awaiting review`,
                    `${formatCurrency(stats.pendingDepositValue)} بانتظار المراجعة`
                  )}
                />
                <Stat
                  label={t("Needs review", "بحاجة للمراجعة")}
                  value={formatNumber(attentionOrders.length)}
                  tone={attentionOrders.length > 0 ? "danger" : "default"}
                  note={t("Provider or refund errors", "أخطاء المزود أو الاسترداد")}
                />
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="text-[13px] font-semibold text-ink">
                  {t("Provider sync", "مزامنة المزود")}
                </h2>
                <p className="text-[11.5px] text-ink-mute">
                  {t(
                    "Status is written by the scheduled sync and manual triggers.",
                    "تُكتب الحالة بواسطة المزامنة المجدولة والتشغيل اليدوي."
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/admin/orders"
                  className="link-quiet text-[12px] font-medium"
                >
                  {t("All orders", "كل الطلبات")}
                </Link>
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={syncing}
                  onClick={handleSyncNow}
                  leadingIcon={<Icon name="refresh" size={13} />}
                >
                  {t("Sync now", "مزامنة الآن")}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5">
              <SyncItem
                label={t("Last run", "آخر تشغيل")}
                value={
                  syncMetrics?.lastRunAt
                    ? timestampToDate(syncMetrics.lastRunAt)
                    : t("Never", "لم يتم")
                }
              />
              <SyncItem
                label={t("Source", "المصدر")}
                value={localizeSyncSource(syncMetrics?.lastRunSource, language)}
              />
              <SyncItem
                label={t("Provider balance", "رصيد المزود")}
                value={providerBalanceLabel}
                tone={provider.error ? "danger" : undefined}
              />
              <SyncItem
                label={t("Refunded", "المسترد")}
                value={formatNumber(syncMetrics?.refunded ?? 0)}
              />
              <SyncItem
                label={t("Awaiting refund", "بانتظار الاسترداد")}
                value={formatNumber(syncMetrics?.awaitingProviderRefund ?? 0)}
                tone={
                  (syncMetrics?.awaitingProviderRefund ?? 0) > 0 ? "warning" : undefined
                }
              />
            </div>
            {syncMetrics?.lastError ? (
              <div className="border-t border-line px-4 py-2.5">
                <Notice tone="danger">
                  {translateErrorMessage(syncMetrics.lastError, language)}
                </Notice>
              </div>
            ) : null}
          </section>

          {attentionOrders.length > 0 ? (
            <section className="panel overflow-hidden">
              <div className="panel-head">
                <div>
                  <h2 className="text-[13px] font-semibold text-ink">
                    {t("Needs review", "بحاجة للمراجعة")}
                  </h2>
                  <p className="text-[11.5px] text-ink-mute">
                    {t(
                      "Provider errors, unknown outcomes, and refund anomalies.",
                      "أخطاء المزود والنتائج غير المعروفة وحالات الاسترداد الشاذة."
                    )}
                  </p>
                </div>
                <Link
                  href="/admin/orders"
                  className="link-quiet text-[12px] font-medium"
                >
                  {t("Open all orders", "فتح كل الطلبات")}
                </Link>
              </div>
              <div className="divide-y divide-line">
                {attentionOrders.slice(0, 6).map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="num-sm text-[12px] text-ink">
                        {order.providerOrderId ?? order.id.slice(0, 10)}
                      </p>
                      <p
                        className="mt-0.5 max-w-[360px] truncate text-[11px] text-ink-mute"
                        data-i18n-ignore
                      >
                        {displayServiceName(order, language)} ·{" "}
                        {order.userEmail || order.userId}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.providerErrorCode ? (
                        <span className="status status-danger">
                          {localizeErrorCode(order.providerErrorCode, language)}
                        </span>
                      ) : order.refundAnomaly ? (
                        <span className="status status-warning">
                          {t("Refund anomaly", "استرداد شاذ")}
                        </span>
                      ) : null}
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat
            label={t("Balance", "الرصيد")}
            value={formatCurrency(balance)}
            note={t("Available to spend", "متاح للإنفاق")}
          />
          <Stat
            label={t("Active orders", "طلبات نشطة")}
            value={formatNumber(stats.activeOrders)}
            note={t("Pending or in progress", "قيد الانتظار أو التنفيذ")}
          />
          <Stat
            label={t("Completed", "مكتملة")}
            value={formatNumber(stats.completedOrders)}
            note={t("Completed or partial", "مكتملة أو جزئية")}
          />
          <Stat
            label={t("Total spent", "إجمالي الإنفاق")}
            value={formatCurrency(stats.spent)}
            note={t("Refunds excluded", "باستثناء المسترد")}
          />
        </div>
      )}

      <section className="space-y-3">
        <SectionHeader
          title={
            isAdmin
              ? t("Recent platform orders", "أحدث طلبات المنصة")
              : t("Recent orders", "أحدث الطلبات")
          }
          description={
            isAdmin
              ? t("Latest activity across every customer.", "أحدث النشاط عبر جميع العملاء.")
              : t("The last orders placed from this account.", "آخر الطلبات من هذا الحساب.")
          }
          actions={
            <Link href="/orders" className="link-quiet text-[12px] font-medium">
              {t("View all orders", "عرض كل الطلبات")}
            </Link>
          }
        />

        {loading ? (
          <SkeletonRows rows={5} />
        ) : recentOrders.length === 0 ? (
          <EmptyState
            icon="receipt"
            title={t("No orders yet", "لا توجد طلبات بعد")}
            description={
              isAdmin
                ? t(
                    "Customer orders will appear here once they are placed.",
                    "ستظهر طلبات العملاء هنا بمجرد إنشائها."
                  )
                : t(
                    "Start from the catalog and place your first order.",
                    "ابدأ من الكتالوج وأنشئ طلبك الأول."
                  )
            }
            action={
              <Link href="/new-order" className="btn btn-primary btn-sm">
                <Icon name="plus" size={14} />
                {t("Place an order", "إنشاء طلب")}
              </Link>
            }
          />
        ) : (
          <div className="panel overflow-hidden">
            <div className="scroll-x hidden md:block">
              <table
                className={`data-table ${
                  isAdmin ? "min-w-[980px]" : "min-w-[760px]"
                }`}
              >
                <thead>
                  <tr>
                    <th>{t("Order", "الطلب")}</th>
                    <th>{t("Service", "الخدمة")}</th>
                    {isAdmin ? <th>{t("Customer", "العميل")}</th> : null}
                    <th className="cell-end">{t("Quantity", "الكمية")}</th>
                    <th className="cell-end">{t("Charge", "المبلغ")}</th>
                    {isAdmin ? (
                      <>
                        <th className="cell-end">
                          {t("Provider cost", "تكلفة المزود")}
                        </th>
                        <th className="cell-end">{t("Net profit", "صافي الربح")}</th>
                      </>
                    ) : null}
                    <th>{t("Date", "التاريخ")}</th>
                    <th>{t("Status", "الحالة")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => {
                    const money = calculateOrderFinancials(
                      order,
                      effectiveMargin
                    );

                    return (
                      <tr key={order.id}>
                        <td>
                          <span className="num-sm text-ink">
                            {order.providerOrderId ?? order.id.slice(0, 8)}
                          </span>
                        </td>
                        <td>
                          <p className="cell-strong max-w-[280px] truncate">
                            {displayServiceName(order, language)}
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-ink-mute">
                            {displayServiceCategory(order, language)}
                          </p>
                        </td>
                        {isAdmin ? (
                          <td className="max-w-[180px] truncate" data-i18n-ignore>
                            {order.userEmail || order.userId}
                          </td>
                        ) : null}
                        <td className="cell-end cell-num">
                          {formatNumber(order.quantity)}
                        </td>
                        <td className="cell-end cell-num">
                          {formatCurrency(Number(order.charge ?? 0))}
                        </td>
                        {isAdmin ? (
                          <>
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
                          </>
                        ) : null}
                        <td className="cell-date whitespace-nowrap">
                          {formatDate(order.createdAt?.toDate?.() ?? null)}
                        </td>
                        <td>
                          <StatusBadge status={order.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {recentOrders.map((order) => {
                const money = calculateOrderFinancials(order, effectiveMargin);

                return (
                  <div key={order.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="num-sm text-ink">
                          {order.providerOrderId ?? order.id.slice(0, 8)}
                        </p>
                        <p className="mt-1 truncate text-[13px] font-medium text-ink">
                          {displayServiceName(order, language)}
                        </p>
                        {isAdmin ? (
                          <p
                            className="mt-0.5 truncate text-[11.5px] text-ink-mute"
                            data-i18n-ignore
                          >
                            {order.userEmail || order.userId}
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="mt-2.5 flex items-end justify-between gap-3">
                      <span className="text-[11.5px] text-ink-mute">
                        {formatDate(order.createdAt?.toDate?.() ?? null)} ·{" "}
                        {formatNumber(order.quantity)} {t("units", "وحدة")}
                      </span>
                      <div className="text-right">
                        <p className="num-sm font-semibold text-ink">
                          {formatCurrency(Number(order.charge ?? 0))}
                        </p>
                        {isAdmin ? (
                          <p
                            className={`num-sm text-[11px] ${
                              money.netProfit < 0
                                ? "text-danger"
                                : "text-ink-mute"
                            }`}
                          >
                            {t("Profit", "الربح")}{" "}
                            {formatSignedCurrency(money.netProfit)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {!isAdmin ? (
        <section className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-[11.5px] text-ink-mute">
            {t(
              "Need help with an order? Contact support with the order ID.",
              "تحتاج مساعدة في طلب؟ تواصل مع الدعم مع ذكر رقم الطلب."
            )}
          </p>
          <div className="flex items-center gap-3">
            <a href="tel:+967711114569" className="link-quiet text-[12px] font-medium">
              {t("Call 711114569", "اتصل بـ 711114569")}
            </a>
            <a
              href="https://wa.me/967711114569"
              target="_blank"
              rel="noreferrer"
              className="link-quiet flex items-center gap-1 text-[12px] font-medium"
            >
              {t("WhatsApp", "واتساب")}
              <Icon name="external" size={12} className="rtl-flip" />
            </a>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SyncItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "danger";
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="rule-label">{label}</p>
      <p
        className={`mt-1.5 truncate text-[12.5px] font-medium ${
          tone === "warning"
            ? "text-warning"
            : tone === "danger"
              ? "text-danger"
              : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

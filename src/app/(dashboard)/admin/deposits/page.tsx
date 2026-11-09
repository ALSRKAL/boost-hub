"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import AdminGuard from "@/components/admin/AdminGuard";
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
  Notice,
  PageHeader,
  SectionHeader,
  SkeletonRows,
  Stat,
} from "@/components/ui/Primitives";
import { formatCurrency, formatNumber } from "@/lib/constants";
import { sumMoney } from "@/lib/money";
import {
  approveDeposit,
  rejectDeposit,
  subscribeAllDeposits,
  subscribeOrderSyncMetrics,
  timestampToDate,
  type DepositDoc,
  type OrderSyncMetricDoc,
} from "@/lib/db";
import {
  localizeStoredNote,
  localizeSyncSource,
  translateErrorMessage,
} from "@/lib/error-messages";

type AdminTab = "pending" | "history";

type PendingAction = {
  kind: "approve" | "reject";
  deposit: DepositDoc;
};

export default function AdminDepositsPage() {
  return (
    <AdminGuard>
      <DepositsContent />
    </AdminGuard>
  );
}

function DepositsContent() {
  const { user, userProfile } = useAuth();
  const { language, t } = useLanguage();
  const { toasts, addToast, removeToast } = useToast();

  const [deposits, setDeposits] = useState<DepositDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<AdminTab>("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [metrics, setMetrics] = useState<OrderSyncMetricDoc | null>(null);

  const deferredSearch = useDeferredValue(search);
  const query = deferredSearch.trim().toLowerCase();

  const handleLoadError = useCallback((error: Error) => {
    console.error("Failed to load deposits:", error);
    setLoadError("The deposit queue could not be loaded.");
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAllDeposits(
      (nextDeposits) => {
        setDeposits(nextDeposits);
        setLoading(false);
      },
      handleLoadError
    );

    return unsubscribe;
  }, [reloadKey, handleLoadError]);

  useEffect(() => {
    const unsubscribe = subscribeOrderSyncMetrics(setMetrics, (error) => {
      console.error("Failed to load sync metrics:", error);
    });
    return unsubscribe;
  }, []);

  const pendingDeposits = useMemo(
    () => deposits.filter((deposit) => deposit.status === "pending"),
    [deposits]
  );
  const historyDeposits = useMemo(
    () => deposits.filter((deposit) => deposit.status !== "pending"),
    [deposits]
  );

  const visibleDeposits = useMemo(() => {
    const scoped = tab === "pending" ? pendingDeposits : historyDeposits;

    if (!query) return scoped;

    return scoped.filter((deposit) =>
      [
        deposit.userEmail,
        deposit.utr,
        deposit.status,
        String(deposit.amount),
        deposit.notes,
      ].some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [tab, pendingDeposits, historyDeposits, query]);

  async function confirmAction() {
    if (!pendingAction || !userProfile?.uid || processingId) return;

    const { kind, deposit } = pendingAction;

    try {
      setProcessingId(deposit.id);

      if (kind === "approve") {
        await approveDeposit(deposit, userProfile.uid);
        addToast(
          t(
            `${formatCurrency(deposit.amount)} credited to ${deposit.userEmail}.`,
            `تم إضافة ${formatCurrency(deposit.amount)} إلى ${deposit.userEmail}.`
          ),
          "success"
        );
      } else {
        await rejectDeposit(deposit.id, userProfile.uid, "Rejected by admin");
        addToast(
          t(
            `Deposit from ${deposit.userEmail} rejected.`,
            `تم رفض إيداع ${deposit.userEmail}.`
          ),
          "info"
        );
      }

      setPendingAction(null);
    } catch (error) {
      console.error(`Failed to ${kind} deposit:`, error);
      addToast(
        translateErrorMessage(
          error instanceof Error
            ? error.message
            : `The deposit could not be ${
                kind === "approve" ? "approved" : "rejected"
              }.`,
          language
        ),
        "error"
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function handleSync() {
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
        const message =
          language === "ar"
            ? `تم فحص ${formatNumber(
                Number(summary.checked ?? 0)
              )} وتحديث ${formatNumber(
                Number(summary.updated ?? 0)
              )} واسترداد ${formatNumber(
                Number(summary.refunded ?? 0)
              )}، و${formatNumber(
                Number(summary.awaitingProviderRefund ?? 0)
              )} بانتظار الاسترداد${
                errors > 0 ? `، وفشل ${formatNumber(errors)}` : ""
              }.`
            : `Checked ${formatNumber(
                Number(summary.checked ?? 0)
              )}, updated ${formatNumber(
                Number(summary.updated ?? 0)
              )}, refunded ${formatNumber(
                Number(summary.refunded ?? 0)
              )}, awaiting ${formatNumber(
                Number(summary.awaitingProviderRefund ?? 0)
              )}${errors > 0 ? `, ${formatNumber(errors)} failed` : ""}.`;
        addToast(message, errors > 0 ? "error" : "success");
      } else {
        addToast(
          t("Provider sync complete.", "اكتملت مزامنة المزود."),
          "success"
        );
      }
    } catch (error) {
      console.error("Failed to sync orders:", error);
      addToast(
        translateErrorMessage(
          error instanceof Error ? error.message : "The provider sync failed.",
          language
        ),
        "error"
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-5">
      <Toast toasts={toasts} onRemove={removeToast} />

      <PageHeader
        eyebrow={t("Administration", "الإدارة")}
        title={t("Deposits", "الإيداعات")}
        description={t(
          "Verify UPI references before crediting a balance. Approval and credit happen in one transaction.",
          "تحقق من مراجع UPI قبل إضافة الرصيد. تتم الموافقة وإضافة الرصيد في معاملة واحدة."
        )}
        actions={
          <Button
            variant="secondary"
            size="sm"
            isLoading={syncing}
            onClick={handleSync}
            leadingIcon={<Icon name="refresh" size={13} />}
          >
            {t("Sync orders", "مزامنة الطلبات")}
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label={t("Pending approvals", "موافقات معلقة")}
          value={formatNumber(pendingDeposits.length)}
          tone={pendingDeposits.length > 0 ? "warning" : "default"}
        />
        <Stat
          label={t("Pending value", "قيمة المعلّق")}
          value={formatCurrency(
            sumMoney(pendingDeposits.map((deposit) => Number(deposit.amount ?? 0)))
          )}
        />
        <Stat
          label={t("Last sync", "آخر مزامنة")}
          value={
            metrics?.lastRunAt
              ? timestampToDate(metrics.lastRunAt)
              : t("Never", "لم يتم")
          }
          note={
            metrics?.lastRunStatus === "failed"
              ? t("Latest run failed", "فشل آخر تشغيل")
              : localizeSyncSource(metrics?.lastRunSource, language)
          }
          tone={metrics?.lastRunStatus === "failed" ? "danger" : "default"}
        />
        <Stat
          label={t("Awaiting refund", "بانتظار الاسترداد")}
          value={formatNumber(metrics?.awaitingProviderRefund ?? 0)}
          note={t(
            `Refunded last run: ${formatNumber(metrics?.refunded ?? 0)}`,
            `المسترد في آخر تشغيل: ${formatNumber(metrics?.refunded ?? 0)}`
          )}
          tone={(metrics?.awaitingProviderRefund ?? 0) > 0 ? "warning" : "default"}
        />
      </section>

      {metrics?.lastError ? (
        <Notice tone="danger">
          {t("Latest sync error:", "آخر خطأ في المزامنة:")}{" "}
          {translateErrorMessage(metrics.lastError, language)}
        </Notice>
      ) : null}

      <section className="space-y-3">
        <SectionHeader
          title={t("Queue", "القائمة")}
          description={t(
            "Approve only after the transaction reference is verified in the bank or UPI app.",
            "وافق فقط بعد التحقق من مرجع العملية في البنك أو تطبيق UPI."
          )}
        />

        <div className="space-y-3">
          <SearchInput
            label={t("Search deposits", "بحث في الإيداعات")}
            value={search}
            onChange={setSearch}
            placeholder={t(
              "Search by email, UTR, amount, status, or note",
              "ابحث بالبريد أو UTR أو المبلغ أو الحالة أو الملاحظة"
            )}
          />
          <div className="panel px-2 pt-1">
            <Tabs
              items={[
                {
                  key: "pending",
                  label: t("Pending", "قيد الانتظار"),
                  count: pendingDeposits.length,
                },
                {
                  key: "history",
                  label: t("History", "السجل"),
                  count: historyDeposits.length,
                },
              ]}
              value={tab}
              onChange={setTab}
              label={t("Deposit queue", "قائمة الإيداعات")}
            />
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={5} />
        ) : loadError ? (
          <ErrorState
            title={t("Deposit queue unavailable", "قائمة الإيداعات غير متاحة")}
            message={translateErrorMessage(loadError, language)}
            onRetry={() => {
              setLoading(true);
              setLoadError(null);
              setReloadKey((value) => value + 1);
            }}
          />
        ) : visibleDeposits.length === 0 ? (
          <EmptyState
            icon={tab === "pending" ? "check" : "bank"}
            title={
              query
                ? t("No deposits match", "لا توجد إيداعات مطابقة")
                : tab === "pending"
                  ? t("Queue is clear", "القائمة فارغة")
                  : t("No history yet", "لا يوجد سجل بعد")
            }
            description={
              query
                ? t("Try another email, UTR, or amount.", "جرّب بريدًا أو UTR أو مبلغًا آخر.")
                : tab === "pending"
                  ? t(
                      "Every submitted deposit has been reviewed.",
                      "تمت مراجعة كل الإيداعات المرسلة."
                    )
                  : t(
                      "Approved and rejected deposits appear here.",
                      "تظهر هنا الإيداعات المقبولة والمرفوضة."
                    )
            }
          />
        ) : (
          <div className="panel overflow-hidden">
            <div className="scroll-x hidden md:block">
              <table className="data-table min-w-[880px]">
                <thead>
                  <tr>
                    <th>{t("Customer", "العميل")}</th>
                    <th className="cell-end">{t("Amount", "المبلغ")}</th>
                    <th>{t("Reference", "المرجع")}</th>
                    <th>{t("Submitted", "تاريخ الإرسال")}</th>
                    <th>{t("Status", "الحالة")}</th>
                    {tab === "pending" ? (
                      <th className="cell-end">{t("Decision", "القرار")}</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {visibleDeposits.map((deposit) => (
                    <tr key={deposit.id}>
                      <td>
                        <p
                          className="cell-strong max-w-[220px] truncate"
                          data-i18n-ignore
                        >
                          {deposit.userEmail || deposit.userId}
                        </p>
                        <p
                          className="mt-0.5 text-[10.5px] text-ink-mute"
                          data-i18n-ignore
                        >
                          {deposit.userId.slice(0, 12)}
                        </p>
                      </td>
                      <td className="cell-end cell-num font-medium">
                        {formatCurrency(deposit.amount)}
                      </td>
                      <td>
                        <span className="num-sm text-ink">{deposit.utr}</span>
                      </td>
                      <td className="cell-date whitespace-nowrap">
                        {timestampToDate(deposit.createdAt)}
                      </td>
                      <td>
                        <div className="space-y-1">
                          <StatusBadge status={deposit.status} />
                          {deposit.notes ? (
                            <p className="max-w-[200px] text-[10.5px] text-ink-mute">
                              {localizeStoredNote(deposit.notes, language)}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      {tab === "pending" ? (
                        <td className="cell-end">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              onClick={() =>
                                setPendingAction({ kind: "approve", deposit })
                              }
                              disabled={processingId !== null}
                            >
                              {t("Approve", "قبول")}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                setPendingAction({ kind: "reject", deposit })
                              }
                              disabled={processingId !== null}
                            >
                              {t("Reject", "رفض")}
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {visibleDeposits.map((deposit) => (
                <article key={deposit.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="truncate text-[12.5px] font-medium text-ink"
                        data-i18n-ignore
                      >
                        {deposit.userEmail || deposit.userId}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-ink-mute">
                        {timestampToDate(deposit.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={deposit.status} />
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-3 border-y border-line py-2">
                    <span className="num-sm font-medium text-ink">
                      {formatCurrency(deposit.amount)}
                    </span>
                    <span className="num-sm break-all text-[11.5px] text-ink-soft">
                      {deposit.utr}
                    </span>
                  </div>

                  {tab === "pending" ? (
                    <div className="mt-2.5 flex gap-2">
                      <Button
                        size="sm"
                        fullWidth
                        onClick={() => setPendingAction({ kind: "approve", deposit })}
                        disabled={processingId !== null}
                      >
                        {t("Approve", "قبول")}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        fullWidth
                        onClick={() => setPendingAction({ kind: "reject", deposit })}
                        disabled={processingId !== null}
                      >
                        {t("Reject", "رفض")}
                      </Button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction?.kind === "approve"
            ? t("Approve this deposit?", "قبول هذا الإيداع؟")
            : t("Reject this deposit?", "رفض هذا الإيداع؟")
        }
        description={
          pendingAction ? (
            pendingAction.kind === "approve" ? (
              <>
                {t("Credit", "إضافة")}{" "}
                <span className="num-sm font-medium text-ink">
                  {formatCurrency(pendingAction.deposit.amount)}
                </span>{" "}
                {t("to", "إلى")}{" "}
                <span className="font-medium text-ink">
                  {pendingAction.deposit.userEmail}
                </span>
                . {t("Confirm the UTR", "تحقق من UTR")}{" "}
                <span className="num-sm text-ink">{pendingAction.deposit.utr}</span>{" "}
                {t("against the payment first.", "مقابل الدفعة أولًا.")}
              </>
            ) : (
              <>
                {t("Reject the", "رفض إيداع")}{" "}
                <span className="num-sm font-medium text-ink">
                  {formatCurrency(pendingAction.deposit.amount)}
                </span>{" "}
                {t("deposit from", "من")}{" "}
                <span className="font-medium text-ink">
                  {pendingAction.deposit.userEmail}
                </span>
                ? {t("No balance is credited.", "لن يُضاف أي رصيد.")}
              </>
            )
          ) : null
        }
        confirmLabel={
          pendingAction?.kind === "approve"
            ? t("Approve and credit", "قبول وإضافة الرصيد")
            : t("Reject", "رفض")
        }
        tone={pendingAction?.kind === "reject" ? "danger" : "default"}
        isBusy={processingId !== null}
        onConfirm={confirmAction}
        onCancel={() => {
          if (!processingId) setPendingAction(null);
        }}
      />
    </div>
  );
}

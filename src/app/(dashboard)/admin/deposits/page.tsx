"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";
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

type AdminTab = "pending" | "history";

type PendingAction = {
  kind: "approve" | "reject";
  deposit: DepositDoc;
};

function formatSyncSource(source?: OrderSyncMetricDoc["lastRunSource"]): string {
  if (source === "cron") return "Scheduled";
  if (source === "sync_secret") return "Secret trigger";
  if (source === "admin") return "Manual";
  return "—";
}

export default function AdminDepositsPage() {
  return (
    <AdminGuard>
      <DepositsContent />
    </AdminGuard>
  );
}

function DepositsContent() {
  const { user, userProfile } = useAuth();
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
          `${formatCurrency(deposit.amount)} credited to ${deposit.userEmail}.`,
          "success"
        );
      } else {
        await rejectDeposit(deposit.id, userProfile.uid, "Rejected by admin");
        addToast(`Deposit from ${deposit.userEmail} rejected.`, "info");
      }

      setPendingAction(null);
    } catch (error) {
      console.error(`Failed to ${kind} deposit:`, error);
      addToast(
        error instanceof Error
          ? error.message
          : `The deposit could not be ${kind === "approve" ? "approved" : "rejected"}.`,
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
        const message = `Checked ${formatNumber(
          Number(summary.checked ?? 0)
        )}, updated ${formatNumber(Number(summary.updated ?? 0))}, refunded ${formatNumber(
          Number(summary.refunded ?? 0)
        )}, awaiting ${formatNumber(Number(summary.awaitingProviderRefund ?? 0))}${
          errors > 0 ? `, ${formatNumber(errors)} failed` : ""
        }.`;
        addToast(message, errors > 0 ? "error" : "success");
      } else {
        addToast("Provider sync complete.", "success");
      }
    } catch (error) {
      console.error("Failed to sync orders:", error);
      addToast(
        error instanceof Error ? error.message : "The provider sync failed.",
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
        eyebrow="Administration"
        title="Deposits"
        description="Verify UPI references before crediting a balance. Approval and credit happen in one transaction."
        actions={
          <Button
            variant="secondary"
            size="sm"
            isLoading={syncing}
            onClick={handleSync}
            leadingIcon={<Icon name="refresh" size={13} />}
          >
            Sync orders
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Pending approvals"
          value={formatNumber(pendingDeposits.length)}
          tone={pendingDeposits.length > 0 ? "warning" : "default"}
        />
        <Stat
          label="Pending value"
          value={formatCurrency(
            sumMoney(pendingDeposits.map((deposit) => Number(deposit.amount ?? 0)))
          )}
        />
        <Stat
          label="Last sync"
          value={metrics?.lastRunAt ? timestampToDate(metrics.lastRunAt) : "Never"}
          note={metrics?.lastRunStatus === "failed" ? "Latest run failed" : formatSyncSource(metrics?.lastRunSource)}
          tone={metrics?.lastRunStatus === "failed" ? "danger" : "default"}
        />
        <Stat
          label="Awaiting refund"
          value={formatNumber(metrics?.awaitingProviderRefund ?? 0)}
          note={`Refunded last run: ${formatNumber(metrics?.refunded ?? 0)}`}
          tone={(metrics?.awaitingProviderRefund ?? 0) > 0 ? "warning" : "default"}
        />
      </section>

      {metrics?.lastError ? (
        <Notice tone="danger">Latest sync error: {metrics.lastError}</Notice>
      ) : null}

      <section className="space-y-3">
        <SectionHeader
          title="Queue"
          description="Approve only after the transaction reference is verified in the bank or UPI app."
        />

        <div className="space-y-3">
          <SearchInput
            label="Search deposits"
            value={search}
            onChange={setSearch}
            placeholder="Search by email, UTR, amount, status, or note"
          />
          <div className="panel px-2 pt-1">
            <Tabs
              items={[
                { key: "pending", label: "Pending", count: pendingDeposits.length },
                { key: "history", label: "History", count: historyDeposits.length },
              ]}
              value={tab}
              onChange={setTab}
              label="Deposit queue"
            />
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={5} />
        ) : loadError ? (
          <ErrorState
            title="Deposit queue unavailable"
            message={loadError}
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
                ? "No deposits match"
                : tab === "pending"
                  ? "Queue is clear"
                  : "No history yet"
            }
            description={
              query
                ? "Try another email, UTR, or amount."
                : tab === "pending"
                  ? "Every submitted deposit has been reviewed."
                  : "Approved and rejected deposits appear here."
            }
          />
        ) : (
          <div className="panel overflow-hidden">
            <div className="scroll-x hidden md:block">
              <table className="data-table min-w-[880px]">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th className="cell-end">Amount</th>
                    <th>Reference</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    {tab === "pending" ? <th className="cell-end">Decision</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {visibleDeposits.map((deposit) => (
                    <tr key={deposit.id}>
                      <td>
                        <p className="cell-strong max-w-[220px] truncate">
                          {deposit.userEmail || deposit.userId}
                        </p>
                        <p className="mt-0.5 text-[10.5px] text-ink-mute">
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
                              {deposit.notes}
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
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                setPendingAction({ kind: "reject", deposit })
                              }
                              disabled={processingId !== null}
                            >
                              Reject
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
                      <p className="truncate text-[12.5px] font-medium text-ink">
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
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        fullWidth
                        onClick={() => setPendingAction({ kind: "reject", deposit })}
                        disabled={processingId !== null}
                      >
                        Reject
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
          pendingAction?.kind === "approve" ? "Approve this deposit?" : "Reject this deposit?"
        }
        description={
          pendingAction ? (
            pendingAction.kind === "approve" ? (
              <>
                Credit{" "}
                <span className="num-sm font-medium text-ink">
                  {formatCurrency(pendingAction.deposit.amount)}
                </span>{" "}
                to{" "}
                <span className="font-medium text-ink">
                  {pendingAction.deposit.userEmail}
                </span>
                . Confirm the UTR{" "}
                <span className="num-sm text-ink">{pendingAction.deposit.utr}</span>{" "}
                against the payment first.
              </>
            ) : (
              <>
                Reject the{" "}
                <span className="num-sm font-medium text-ink">
                  {formatCurrency(pendingAction.deposit.amount)}
                </span>{" "}
                deposit from{" "}
                <span className="font-medium text-ink">
                  {pendingAction.deposit.userEmail}
                </span>
                ? No balance is credited.
              </>
            )
          ) : null
        }
        confirmLabel={pendingAction?.kind === "approve" ? "Approve and credit" : "Reject"}
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

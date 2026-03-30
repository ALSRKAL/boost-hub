"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import AdminGuard from "@/components/admin/AdminGuard";
import Toast, { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import {
  approveDeposit,
  rejectDeposit,
  statusBadgeClass,
  subscribeAllDeposits,
  subscribeOrderSyncMetrics,
  timestampToDate,
  type DepositDoc,
  type OrderSyncMetricDoc,
} from "@/lib/db";
import { formatCurrency } from "@/lib/constants";

type TabKey = "pending" | "history";

export default function AdminDepositsPage() {
  return (
    <AdminGuard>
      <DepositsPageContent />
    </AdminGuard>
  );
}

function DepositsPageContent() {
  const { user, userProfile } = useAuth();
  const { toasts, addToast, removeToast } = useToast();

  const [deposits, setDeposits] = useState<DepositDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [syncMetrics, setSyncMetrics] = useState<OrderSyncMetricDoc | null>(null);

  const handleLoadDepositsError = useEffectEvent((err: unknown) => {
    console.error("Failed to load deposits:", err);
    addToast("Failed to load deposits. Please try again.", "error");
  });

  useEffect(() => {
    let receivedInitialSnapshot = false;

    setLoading(true);
    const unsubscribe = subscribeAllDeposits(
      (nextDeposits) => {
        setDeposits(nextDeposits);
        if (!receivedInitialSnapshot) {
          receivedInitialSnapshot = true;
          setLoading(false);
        }
      },
      (err) => {
        handleLoadDepositsError(err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeOrderSyncMetrics(
      (nextMetrics) => {
        setSyncMetrics(nextMetrics);
      },
      (err) => {
        console.error("Failed to load order sync metrics:", err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const pendingDeposits = useMemo(
    () => deposits.filter((deposit) => deposit.status === "pending"),
    [deposits]
  );

  const depositHistory = useMemo(
    () => deposits.filter((deposit) => deposit.status !== "pending"),
    [deposits]
  );

  const visibleDeposits =
    activeTab === "pending" ? pendingDeposits : depositHistory;

  async function handleApprove(deposit: DepositDoc) {
    if (!userProfile?.uid) return;

    try {
      setProcessingId(deposit.id);
      await approveDeposit(deposit, userProfile.uid);
      setDeposits((current) =>
        current.map((item) =>
          item.id === deposit.id
            ? { ...item, status: "approved", reviewedBy: userProfile.uid }
            : item
        )
      );
      addToast(
        `Approved ${formatCurrency(deposit.amount)} for ${deposit.userEmail}`,
        "success"
      );
    } catch (err) {
      console.error("Failed to approve deposit:", err);
      addToast("Failed to approve deposit. Please try again.", "error");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(deposit: DepositDoc) {
    if (!userProfile?.uid) return;

    const confirmed = window.confirm(
      `Reject deposit of ${formatCurrency(deposit.amount)} from ${deposit.userEmail}?`
    );
    if (!confirmed) return;

    try {
      setProcessingId(deposit.id);
      await rejectDeposit(deposit.id, userProfile.uid, "Rejected by admin");
      setDeposits((current) =>
        current.map((item) =>
          item.id === deposit.id
            ? { ...item, status: "rejected", reviewedBy: userProfile.uid }
            : item
        )
      );
      addToast(`Rejected deposit from ${deposit.userEmail}`, "info");
    } catch (err) {
      console.error("Failed to reject deposit:", err);
      addToast("Failed to reject deposit. Please try again.", "error");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleOrderSync() {
    if (!user) return;

    try {
      setSyncingOrders(true);
      const token = await user.getIdToken();
      const response = await fetch("/api/cron/sync-orders", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Failed to sync orders.";
        throw new Error(message);
      }

      const summary =
        typeof payload === "object" && payload !== null && "summary" in payload
          ? payload.summary
          : null;

      if (
        summary &&
        typeof summary === "object" &&
        "updated" in summary &&
        "refunded" in summary &&
        "checked" in summary
      ) {
        const awaitingProviderRefund =
          "awaitingProviderRefund" in summary
            ? String(summary.awaitingProviderRefund)
            : "0";
        const providerBalanceAfter =
          "providerBalanceAfter" in summary &&
          typeof summary.providerBalanceAfter === "number"
            ? ` Provider balance: ₹${summary.providerBalanceAfter.toFixed(2)}.`
            : "";
        addToast(
          `Order sync complete. Checked ${String(summary.checked)}, updated ${String(summary.updated)}, refunded ${String(summary.refunded)}, awaiting provider refund ${awaitingProviderRefund}.${providerBalanceAfter}`,
          "success"
        );
      } else {
        addToast("Order sync complete.", "success");
      }
    } catch (err) {
      console.error("Failed to sync orders:", err);
      addToast(
        err instanceof Error ? err.message : "Failed to sync orders.",
        "error"
      );
    } finally {
      setSyncingOrders(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Toast toasts={toasts} onRemove={removeToast} />

      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Admin Review
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text-primary)]">
            Deposits
          </h1>
          <p className="max-w-3xl text-sm text-[var(--color-text-muted)]">
            Review incoming deposit requests, approve valid payments, and keep a
            full history of every decision.
          </p>
        </div>

        <Button
          variant="secondary"
          isLoading={syncingOrders}
          onClick={handleOrderSync}
        >
          Sync Orders with Provider
        </Button>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SyncMetricCard
          label="Last Sync"
          value={syncMetrics?.lastRunAt ? timestampToDate(syncMetrics.lastRunAt) : "Never"}
          note={syncMetrics?.lastRunStatus === "failed" ? "Latest run failed" : "Latest sync timestamp"}
          accent={syncMetrics?.lastRunStatus === "failed" ? "danger" : "default"}
        />
        <SyncMetricCard
          label="Sync Source"
          value={formatSyncSource(syncMetrics?.lastRunSource)}
          note="GitHub Actions, secret ping, or admin manual trigger"
        />
        <SyncMetricCard
          label="Refunded"
          value={String(syncMetrics?.refunded ?? 0)}
          note="Orders refunded in the most recent sync"
          accent="success"
        />
        <SyncMetricCard
          label="Awaiting"
          value={String(syncMetrics?.awaitingProviderRefund ?? 0)}
          note="Orders still waiting for provider confirmation"
          accent="warning"
        />
      </section>

      {syncMetrics?.lastError ? (
        <div className="glass-card rounded-3xl border border-red-500/20 bg-red-500/5 p-5">
          <p className="text-sm font-semibold text-red-300">Last sync error</p>
          <p className="mt-2 text-sm text-red-200/80">{syncMetrics.lastError}</p>
        </div>
      ) : null}

      <section className="flex flex-wrap items-center gap-3">
        <TabButton
          label="Pending Approvals"
          count={pendingDeposits.length}
          active={activeTab === "pending"}
          onClick={() => setActiveTab("pending")}
        />
        <TabButton
          label="Deposit History"
          count={depositHistory.length}
          active={activeTab === "history"}
          onClick={() => setActiveTab("history")}
        />
      </section>

      {loading ? (
        <DepositsSkeleton />
      ) : visibleDeposits.length === 0 ? (
        <DepositsEmpty activeTab={activeTab} />
      ) : (
        <DepositsTable
          deposits={visibleDeposits}
          activeTab={activeTab}
          processingId={processingId}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  );
}

function formatSyncSource(source?: OrderSyncMetricDoc["lastRunSource"]): string {
  if (source === "cron") return "GitHub Action / Cron";
  if (source === "sync_secret") return "Secret Trigger";
  if (source === "admin") return "Admin Manual Sync";
  return "—";
}

function SyncMetricCard({
  label,
  value,
  note,
  accent = "default",
}: {
  label: string;
  value: string;
  note: string;
  accent?: "default" | "success" | "warning" | "danger";
}) {
  const accentClasses = {
    default: "border-[var(--color-border)] bg-[var(--color-bg-secondary)]/70",
    success: "border-emerald-500/20 bg-emerald-500/10",
    warning: "border-amber-500/20 bg-amber-500/10",
    danger: "border-red-500/20 bg-red-500/10",
  } as const;

  return (
    <div className={`glass-card rounded-3xl border p-5 ${accentClasses[accent]}`}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">{value}</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{note}</p>
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200 ${
        active
          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
          : "border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          active
            ? "bg-white/15 text-white"
            : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function DepositsTable({
  deposits,
  activeTab,
  processingId,
  onApprove,
  onReject,
}: {
  deposits: DepositDoc[];
  activeTab: TabKey;
  processingId: string | null;
  onApprove: (deposit: DepositDoc) => void;
  onReject: (deposit: DepositDoc) => void;
}) {
  return (
    <div className="glass-card overflow-hidden rounded-3xl border border-[var(--color-border)]">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[920px]">
          <thead>
            <tr className="bg-[var(--color-bg-tertiary)]/55">
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                User Email
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Amount
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                UTR
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Date
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Status
              </th>
              {activeTab === "pending" && (
                <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {deposits.map((deposit) => (
              <tr
                key={deposit.id}
                className="transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]/30"
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-hover)] text-sm font-semibold text-white">
                      {deposit.userEmail[0]?.toUpperCase() ?? "U"}
                    </div>
                    <span className="text-sm text-[var(--color-text-primary)]">
                      {deposit.userEmail}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-[var(--color-accent)]">
                  {formatCurrency(deposit.amount)}
                </td>
                <td className="px-5 py-4">
                  <code className="rounded-lg bg-[var(--color-bg-tertiary)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">
                    {deposit.utr}
                  </code>
                </td>
                <td className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">
                  {timestampToDate(deposit.createdAt)}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${statusBadgeClass(deposit.status)}`}
                  >
                    {deposit.status}
                  </span>
                </td>
                {activeTab === "pending" && (
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        isLoading={processingId === deposit.id}
                        disabled={processingId !== null}
                        onClick={() => onApprove(deposit)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        isLoading={processingId === deposit.id}
                        disabled={processingId !== null}
                        onClick={() => onReject(deposit)}
                      >
                        Reject
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[var(--color-border)] lg:hidden">
        {deposits.map((deposit) => (
          <div key={deposit.id} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {deposit.userEmail}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {timestampToDate(deposit.createdAt)}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusBadgeClass(deposit.status)}`}
              >
                {deposit.status}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold text-[var(--color-accent)]">
                {formatCurrency(deposit.amount)}
              </span>
              <code className="rounded-lg bg-[var(--color-bg-tertiary)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">
                {deposit.utr}
              </code>
            </div>

            {activeTab === "pending" && (
              <div className="flex gap-2 pt-1">
                <Button
                  fullWidth
                  size="sm"
                  isLoading={processingId === deposit.id}
                  disabled={processingId !== null}
                  onClick={() => onApprove(deposit)}
                >
                  Approve
                </Button>
                <Button
                  fullWidth
                  size="sm"
                  variant="danger"
                  isLoading={processingId === deposit.id}
                  disabled={processingId !== null}
                  onClick={() => onReject(deposit)}
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DepositsSkeleton() {
  return (
    <div className="glass-card rounded-3xl p-5 space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-16 rounded-2xl animate-shimmer" />
      ))}
    </div>
  );
}

function DepositsEmpty({ activeTab }: { activeTab: TabKey }) {
  return (
    <div className="glass-card rounded-3xl p-12 text-center">
      <span className="mb-4 block text-5xl">
        {activeTab === "pending" ? "🎉" : "📭"}
      </span>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        {activeTab === "pending" ? "No pending approvals" : "No deposit history yet"}
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {activeTab === "pending"
          ? "Every pending request has already been processed."
          : "Approved and rejected deposits will appear here once admins start reviewing requests."}
      </p>
    </div>
  );
}

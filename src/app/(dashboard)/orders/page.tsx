"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/ui/Button";
import Toast, { useToast } from "@/components/ui/Toast";
import {
  getUserOrders,
  statusBadgeClass,
  timestampToDate,
  type OrderDoc,
} from "@/lib/db";
import { formatCurrency } from "@/lib/constants";
import { Timestamp } from "firebase/firestore";

// ── Refill helpers (client-side) ──────────────────────────────────

const MINIMUM_WAIT_MS = 24 * 60 * 60 * 1000;

function tsToMs(ts: Timestamp | undefined): number | null {
  if (!ts) return null;
  try {
    return ts.toDate().getTime();
  } catch {
    return null;
  }
}

interface RefillState {
  kind:
    | "no_refill"
    | "not_eligible"
    | "countdown"
    | "available"
    | "requested"
    | "expired"
    | "waiting_completion";
  label: string;
  remainMs?: number;
}

function getRefillState(order: OrderDoc, nowMs: number): RefillState {
  // Already requested
  if (order.refillRequestId) {
    const statusLabel = order.refillStatus
      ? `Refill ${order.refillStatus}`
      : "Refill requested";
    return { kind: "requested", label: statusLabel };
  }

  // No refill support
  if (!order.supportsRefill) {
    return { kind: "no_refill", label: "No refill support" };
  }

  // Not completed/partial
  if (order.status !== "completed" && order.status !== "partial") {
    return { kind: "waiting_completion", label: "Refill after completion" };
  }

  // ── Determine timing ─────────────────────────────────────────────
  const completedAtMs = tsToMs(order.completedAt);
  const refillAvailableAtMs = tsToMs(order.refillAvailableAt);
  const windowHours = order.refillWindowHours;

  // Check if refill window has expired
  if (
    completedAtMs &&
    typeof windowHours === "number" &&
    windowHours > 0 &&
    windowHours < 999999
  ) {
    const expiryMs = completedAtMs + windowHours * 60 * 60 * 1000;
    if (nowMs > expiryMs) {
      return { kind: "expired", label: "Refill window expired" };
    }
  }

  // If windowHours is explicitly 0 (parsed "No Refill" from service name)
  if (windowHours === 0) {
    return { kind: "no_refill", label: "No refill support" };
  }

  // Compute countdown
  let availableAt: number | null = null;

  if (refillAvailableAtMs) {
    availableAt = refillAvailableAtMs;
  } else if (completedAtMs) {
    availableAt = completedAtMs + MINIMUM_WAIT_MS;
  }

  if (availableAt && nowMs < availableAt) {
    const remain = availableAt - nowMs;
    return {
      kind: "countdown",
      label: `Refill available in ${formatCountdownStr(remain)}`,
      remainMs: remain,
    };
  }

  // Available now
  return { kind: "available", label: "Request Refill" };
}

function formatCountdownStr(ms: number): string {
  if (ms <= 0) return "now";

  const totalMinutes = Math.ceil(ms / (1000 * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}m`);

  return parts.join(" ") || "< 1m";
}

// ── Page ──────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { user } = useAuth();
  const { toasts, addToast, removeToast } = useToast();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refillingOrderId, setRefillingOrderId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Re-render every 30s so countdowns update
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nowMs = useMemo(() => Date.now(), [orders, tick]);

  useEffect(() => {
    const userId = user?.uid;

    if (!userId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadOrders() {
      try {
        if (!userId) {
          setOrders([]);
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);
        const nextOrders = await getUserOrders(userId);

        if (!cancelled) {
          setOrders(nextOrders);
        }
      } catch (err) {
        console.error("Failed to load orders:", err);
        if (!cancelled) {
          setError("Failed to load your orders. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOrders();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const handleRefill = useCallback(
    async (order: OrderDoc) => {
      if (!user?.uid) {
        addToast("You must be logged in to request a refill.", "error");
        return;
      }

      try {
        setRefillingOrderId(order.id);
        const token = await user.getIdToken();
        const response = await fetch("/api/order/refill", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            userId: user.uid,
          }),
        });

        const payload: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "Failed to request refill.";
          throw new Error(message);
        }

        setOrders((current) =>
          current.map((item) =>
            item.id === order.id
              ? {
                  ...item,
                  refillRequestId:
                    typeof payload === "object" &&
                    payload !== null &&
                    "refillRequestId" in payload &&
                    typeof payload.refillRequestId === "string"
                      ? payload.refillRequestId
                      : "requested",
                  refillStatus: "requested",
                }
              : item
          )
        );
        addToast("Refill requested successfully.", "success");
      } catch (refillError) {
        console.error("Failed to request refill:", refillError);
        addToast(
          refillError instanceof Error
            ? refillError.message
            : "Failed to request refill.",
          "error"
        );
      } finally {
        setRefillingOrderId(null);
      }
    },
    [user, addToast]
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Toast toasts={toasts} onRemove={removeToast} />

      <section className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
          Order Timeline
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text-primary)]">
          Your Orders
        </h1>
        <p className="max-w-3xl text-sm text-[var(--color-text-muted)]">
          Review every order you placed, its current provider status, and the
          exact amount charged to your balance.
        </p>
      </section>

      {loading ? (
        <OrdersSkeleton />
      ) : error ? (
        <OrdersError message={error} />
      ) : orders.length === 0 ? (
        <OrdersEmpty />
      ) : (
        <OrdersTable
          orders={orders}
          nowMs={nowMs}
          refillingOrderId={refillingOrderId}
          onRefill={handleRefill}
        />
      )}
    </div>
  );
}

// ── Refill Badge ──────────────────────────────────────────────────

function RefillBadge({
  state,
  isLoading,
  onRefill,
}: {
  state: RefillState;
  isLoading: boolean;
  onRefill: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Auto-hide tooltip after 3 seconds
  useEffect(() => {
    if (!showTooltip) return;
    const timer = setTimeout(() => setShowTooltip(false), 3000);
    return () => clearTimeout(timer);
  }, [showTooltip]);

  if (state.kind === "available") {
    return (
      <button
        type="button"
        onClick={onRefill}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 transition-all duration-200 hover:bg-emerald-500/20 hover:border-emerald-500/50 active:scale-95 disabled:opacity-60"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Requesting…
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            Request Refill
          </>
        )}
      </button>
    );
  }

  if (state.kind === "countdown") {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowTooltip(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-2 text-xs font-semibold text-amber-300/70 cursor-pointer transition-all hover:border-amber-500/40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Refill
        </button>
        {showTooltip && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-[220px] rounded-xl border border-amber-500/30 bg-[var(--color-bg-secondary)] px-3 py-2 text-center shadow-xl shadow-black/30">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-300">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              {state.label}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
              <div className="border-4 border-transparent border-t-[var(--color-bg-secondary)]" />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (state.kind === "waiting_completion") {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowTooltip(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-[11px] text-[var(--color-text-muted)] cursor-pointer transition-all hover:border-[var(--color-text-muted)]/30"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Refill
        </button>
        {showTooltip && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-[220px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-center shadow-xl shadow-black/30">
            <p className="text-xs text-[var(--color-text-muted)]">
              Refill will be available after order completes and 24h waiting period
            </p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
              <div className="border-4 border-transparent border-t-[var(--color-bg-secondary)]" />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (state.kind === "requested") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/20 bg-blue-500/8 px-3 py-1.5 text-xs font-semibold text-blue-300 capitalize">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
        {state.label}
      </div>
    );
  }

  if (state.kind === "expired") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-1.5 text-[11px] font-semibold text-red-300">
        {state.label}
      </span>
    );
  }

  if (state.kind === "no_refill") {
    return (
      <span className="text-xs text-[var(--color-text-muted)]">
        —
      </span>
    );
  }

  return null;
}

// ── Orders Table ──────────────────────────────────────────────────

function getRefundMessage(order: OrderDoc): string | null {
  if (order.status !== "cancelled") {
    return null;
  }

  if (order.refundState === "refunded_to_user") {
    return "Refunded to your balance";
  }

  if (order.refundState === "awaiting_provider_refund") {
    return "Cancelled at provider. Waiting for provider refund confirmation.";
  }

  return "Cancelled";
}

function OrdersTable({
  orders,
  nowMs,
  refillingOrderId,
  onRefill,
}: {
  orders: OrderDoc[];
  nowMs: number;
  refillingOrderId: string | null;
  onRefill: (order: OrderDoc) => Promise<void>;
}) {

  return (
    <div className="glass-card overflow-hidden rounded-3xl border border-[var(--color-border)]">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr className="bg-[var(--color-bg-tertiary)]/55">
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Order ID
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Service
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Target Link
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Quantity
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Charge
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Date
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Status
              </th>
              <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Refill
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {orders.map((order) => {
              const refillState = getRefillState(order, nowMs);
              return (
                <tr
                  key={order.id}
                  className="transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]/30"
                >
                  <td className="px-5 py-4">
                    <div className="space-y-1">
                      <code className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">
                        #{order.providerOrderId ?? order.id}
                      </code>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Local: {order.id}
                      </p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1">
                      <p className="font-medium text-[var(--color-text-primary)]">
                        {order.serviceName || `Service #${order.serviceId}`}
                      </p>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Service ID: {order.serviceId}
                      </p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <a
                      href={order.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block max-w-[260px] truncate text-sm text-[var(--color-accent-hover)] hover:text-[var(--color-accent)]"
                    >
                      {order.link}
                    </a>
                  </td>
                  <td className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">
                    {order.quantity.toLocaleString("en-IN")}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-[var(--color-accent)]">
                    {formatCurrency(order.charge)}
                  </td>
                  <td className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">
                    {timestampToDate(order.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1">
                      <span
                        className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${statusBadgeClass(order.status)}`}
                      >
                        {order.status.replace("_", " ")}
                      </span>
                      {getRefundMessage(order) ? (
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {getRefundMessage(order)}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <RefillBadge
                      state={refillState}
                      isLoading={refillingOrderId === order.id}
                      onRefill={() => onRefill(order)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="divide-y divide-[var(--color-border)] lg:hidden">
        {orders.map((order) => {
          const refillState = getRefillState(order, nowMs);
          return (
            <div key={order.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <code className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--color-text-secondary)]">
                    #{order.providerOrderId ?? order.id}
                  </code>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {order.serviceName || `Service #${order.serviceId}`}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusBadgeClass(order.status)}`}
                >
                  {order.status.replace("_", " ")}
                </span>
              </div>

              {getRefundMessage(order) ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {getRefundMessage(order)}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <MetaTile label="Service ID" value={order.serviceId} />
                <MetaTile
                  label="Quantity"
                  value={order.quantity.toLocaleString("en-IN")}
                />
                <MetaTile label="Charge" value={formatCurrency(order.charge)} accent />
                <MetaTile label="Date" value={timestampToDate(order.createdAt)} />
              </div>

              <a
                href={order.link}
                target="_blank"
                rel="noreferrer"
                className="block truncate rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-accent-hover)]"
              >
                {order.link}
              </a>

              {/* Refill area for mobile */}
              {refillState.kind !== "no_refill" && (
                <div className="flex items-center justify-center">
                  {refillState.kind === "available" ? (
                    <button
                      type="button"
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-3 text-sm font-semibold text-emerald-300 transition-all active:scale-[0.98] disabled:opacity-60"
                      disabled={refillingOrderId === order.id}
                      onClick={() => onRefill(order)}
                    >
                      {refillingOrderId === order.id ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          Requesting…
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                          Request Refill
                        </>
                      )}
                    </button>
                  ) : refillState.kind === "countdown" ? (
                    <MobileRefillCountdown label={refillState.label} />
                  ) : refillState.kind === "requested" ? (
                    <div className="w-full rounded-2xl border border-blue-500/20 bg-blue-500/8 px-4 py-3 text-center text-sm text-blue-300 capitalize">
                      <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
                      {refillState.label}
                    </div>
                  ) : refillState.kind === "expired" ? (
                    <div className="w-full rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-center text-sm text-red-300">
                      {refillState.label}
                    </div>
                  ) : refillState.kind === "waiting_completion" ? (
                    <MobileRefillWaiting />
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Mobile Refill Components ──────────────────────────────────────

function MobileRefillCountdown({ label }: { label: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-center transition-all active:scale-[0.98]"
    >
      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-amber-300/70">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Refill
      </div>
      {expanded && (
        <p className="mt-2 text-xs font-semibold text-amber-300">
          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          {label}
        </p>
      )}
    </button>
  );
}

function MobileRefillWaiting() {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 text-center transition-all active:scale-[0.98]"
    >
      <div className="flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Refill
      </div>
      {expanded && (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Available after order completes + 24h waiting period
        </p>
      )}
    </button>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function MetaTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-medium ${accent ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]"}`}
      >
        {value}
      </p>
    </div>
  );
}

function OrdersSkeleton() {
  return (
    <div className="glass-card rounded-3xl p-5 space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-16 rounded-2xl animate-shimmer" />
      ))}
    </div>
  );
}

function OrdersEmpty() {
  return (
    <div className="glass-card rounded-3xl p-12 text-center">
      <span className="mb-4 block text-5xl">📦</span>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        No orders yet
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Your placed orders will appear here as soon as you start using the panel.
      </p>
    </div>
  );
}

function OrdersError({ message }: { message: string }) {
  return (
    <div className="glass-card rounded-3xl p-12 text-center">
      <span className="mb-4 block text-5xl">⚠️</span>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Unable to load orders
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{message}</p>
    </div>
  );
}

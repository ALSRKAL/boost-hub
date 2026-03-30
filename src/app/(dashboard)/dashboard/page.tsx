"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { formatCurrency } from "@/lib/constants";
import {
  getAllDeposits,
  getAllOrders,
  getUserOrders,
  statusBadgeClass,
  timestampToDate,
  type DepositDoc,
  type OrderDoc,
} from "@/lib/db";

const REVENUE_STATUSES = new Set<OrderDoc["status"]>([
  "completed",
  "processing",
  "in_progress",
]);

const ACTIVE_STATUSES = new Set<OrderDoc["status"]>([
  "pending",
  "processing",
  "in_progress",
]);

export default function DashboardPage() {
  const { user, userProfile } = useAuth();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [deposits, setDeposits] = useState<DepositDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = userProfile?.role === "admin";

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      const userId = user?.uid;

      if (!userProfile || (!isAdmin && !userId)) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        if (isAdmin) {
          const [allOrders, allDeposits] = await Promise.all([
            getAllOrders(),
            getAllDeposits(),
          ]);

          if (cancelled) return;

          setOrders(allOrders);
          setDeposits(allDeposits);
          return;
        }

        if (!userId) {
          setLoading(false);
          return;
        }

        const userOrders = await getUserOrders(userId);

        if (cancelled) return;

        setOrders(userOrders);
        setDeposits([]);
      } catch (loadError) {
        if (cancelled) return;
        console.error("Failed to load dashboard data:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load dashboard data."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, user?.uid, userProfile]);

  const revenueOrders = orders.filter((order) => REVENUE_STATUSES.has(order.status));
  const totalRevenue = revenueOrders.reduce(
    (sum, order) => sum + Number(order.charge ?? 0),
    0
  );
  const totalProviderCost = revenueOrders.reduce(
    (sum, order) => sum + Number(order.providerCharge ?? 0),
    0
  );
  const netProfit = totalRevenue - totalProviderCost;
  const pendingDeposits = deposits.filter((deposit) => deposit.status === "pending").length;

  const userStats = [
    {
      label: "Balance",
      value: formatCurrency(userProfile?.balance ?? 0),
      icon: "💰",
      gradient: "from-blue-500/12 to-cyan-500/8",
      border: "border-blue-500/20",
    },
    {
      label: isAdmin ? "Platform Orders" : "Total Orders",
      value: orders.length.toLocaleString("en-IN"),
      icon: "📦",
      gradient: "from-fuchsia-500/12 to-pink-500/8",
      border: "border-fuchsia-500/20",
    },
    {
      label: isAdmin ? "Order Revenue" : "Total Spent",
      value: formatCurrency(
        orders.reduce((sum, order) => sum + Number(order.charge ?? 0), 0)
      ),
      icon: "💸",
      gradient: "from-amber-500/12 to-orange-500/8",
      border: "border-amber-500/20",
    },
    {
      label: "Active Orders",
      value: orders
        .filter((order) => ACTIVE_STATUSES.has(order.status))
        .length.toLocaleString("en-IN"),
      icon: "⚡",
      gradient: "from-emerald-500/12 to-teal-500/8",
      border: "border-emerald-500/20",
    },
  ];

  const recentOrders = orders.slice(0, 6);
  const quickActions = [
    { label: "New Order", href: "/new-order", icon: "🛒", desc: "Place a new order" },
    { label: "Add Funds", href: "/add-funds", icon: "💰", desc: "Top up your balance" },
    { label: "View Services", href: "/services", icon: "📋", desc: "Browse all services" },
    ...(!isAdmin
      ? [
          {
            label: "Call Support",
            href: "tel:+967711114569",
            icon: "📞",
            desc: "Call: 711114569",
            external: true,
          },
          {
            label: "WhatsApp",
            href: "https://wa.me/967711114569?text=Hello%2C%20I%20need%20help%20with%20my%20BoostHub%20account.",
            icon: "💬",
            desc: "Chat on WhatsApp",
            external: true,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] lg:text-3xl">
          Welcome back
          {userProfile?.displayName ? `, ${userProfile.displayName.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-[var(--color-text-muted)]">
          {isAdmin
            ? "Track revenue, provider cost, profit, and urgent deposit approvals from one place."
            : "Here&apos;s a clean overview of your balance, orders, and account activity."}
        </p>
      </section>

      {isAdmin ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                Founder&apos;s Report
              </div>
              <h2 className="mt-3 text-xl font-semibold text-[var(--color-text-primary)]">
                Profit dashboard
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Revenue is calculated from processing and completed orders only.
              </p>
            </div>
            <Link
              href="/admin/deposits"
              className="inline-flex items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-bg-tertiary)]"
            >
              Review pending deposits
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ReportCard
              label="Total Revenue"
              value={formatCurrency(totalRevenue)}
              note="Sum of charge from processing and completed orders"
              accent="blue"
            />
            <ReportCard
              label="Total Provider Cost"
              value={formatCurrency(totalProviderCost)}
              note="True provider-side cost saved per order"
              accent="violet"
            />
            <ReportCard
              label="NET PROFIT"
              value={formatCurrency(netProfit)}
              note="Revenue minus provider cost"
              accent="profit"
            />
            <ReportCard
              label="Pending Deposits"
              value={pendingDeposits.toLocaleString("en-IN")}
              note="Deposits waiting for admin action"
              accent="amber"
            />
          </div>
        </section>
      ) : null}

      {error ? <ErrorState message={error} /> : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {userStats.map((stat) => (
          <div
            key={stat.label}
            className={`glass-card rounded-3xl border ${stat.border} bg-gradient-to-br ${stat.gradient} p-5 transition-transform duration-200 hover:scale-[1.01]`}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-2xl">{stat.icon}</span>
            </div>
            <p className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--color-text-primary)] truncate">
              {loading ? "…" : stat.value}
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {quickActions.map((action) =>
          action.external ? (
            <a
              key={action.label}
              href={action.href}
              className="glass-card group flex items-center gap-4 rounded-3xl p-5 transition-all duration-200 hover:scale-[1.01] hover:bg-[var(--color-bg-tertiary)]"
            >
              <span className="text-3xl transition-transform duration-200 group-hover:scale-110">
                {action.icon}
              </span>
              <div>
                <p className="font-semibold text-[var(--color-text-primary)]">
                  {action.label}
                </p>
                <p className="text-sm text-[var(--color-text-muted)]">{action.desc}</p>
              </div>
            </a>
          ) : (
            <Link
              key={action.label}
              href={action.href}
              className="glass-card group flex items-center gap-4 rounded-3xl p-5 transition-all duration-200 hover:scale-[1.01] hover:bg-[var(--color-bg-tertiary)]"
            >
              <span className="text-3xl transition-transform duration-200 group-hover:scale-110">
                {action.icon}
              </span>
              <div>
                <p className="font-semibold text-[var(--color-text-primary)]">
                  {action.label}
                </p>
                <p className="text-sm text-[var(--color-text-muted)]">{action.desc}</p>
              </div>
            </Link>
          )
        )}
      </section>

      <section className="glass-card rounded-3xl p-6 lg:p-7">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {isAdmin ? "Recent Platform Orders" : "Recent Orders"}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {isAdmin
                ? "A quick pulse on the latest orders and their current status."
                : "Your latest orders and their delivery status."}
            </p>
          </div>
          <Link
            href="/orders"
            className="text-sm font-semibold text-[var(--color-accent)] transition hover:text-[var(--color-accent-hover)]"
          >
            Open orders page
          </Link>
        </div>

        {loading ? (
          <RecentOrdersSkeleton />
        ) : recentOrders.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/60 p-8 text-center">
            <span className="mb-3 block text-4xl">📭</span>
            <p className="text-[var(--color-text-muted)]">
              No orders yet. Start by placing your first order.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-3xl border border-[var(--color-border)]">
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="bg-[var(--color-bg-tertiary)]/55">
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                      Provider ID
                    </th>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                      Service
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
                    <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order, index) => (
                    <tr
                      key={order.id}
                      className={`border-t border-[var(--color-border)]/70 ${
                        index % 2 === 0 ? "bg-black/5" : ""
                      }`}
                    >
                      <td className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">
                        {order.providerOrderId || order.id}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {order.serviceName || `Service #${order.serviceId}`}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {order.category || "Uncategorized"}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">
                        {order.quantity.toLocaleString("en-IN")}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-[var(--color-text-primary)]">
                        {formatCurrency(Number(order.charge ?? 0))}
                      </td>
                      <td className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">
                        {timestampToDate(order.createdAt)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusBadgeClass(
                            order.status
                          )}`}
                        >
                          {order.status.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-4 lg:hidden">
              {recentOrders.map((order) => (
                <article
                  key={order.id}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                        {order.providerOrderId || order.id}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-[var(--color-text-primary)]">
                        {order.serviceName || `Service #${order.serviceId}`}
                      </h3>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusBadgeClass(
                        order.status
                      )}`}
                    >
                      {order.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <MiniStat
                      label="Charge"
                      value={formatCurrency(Number(order.charge ?? 0))}
                    />
                    <MiniStat
                      label="Quantity"
                      value={order.quantity.toLocaleString("en-IN")}
                    />
                    <MiniStat label="Date" value={timestampToDate(order.createdAt)} />
                    <MiniStat label="Category" value={order.category || "—"} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ReportCard({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent: "blue" | "violet" | "profit" | "amber";
}) {
  const accentClasses = {
    blue: "border-sky-500/20 bg-gradient-to-br from-sky-500/12 to-cyan-500/6 text-sky-100",
    violet:
      "border-violet-500/20 bg-gradient-to-br from-violet-500/12 to-fuchsia-500/6 text-violet-100",
    profit:
      "border-emerald-500/25 bg-gradient-to-br from-emerald-500/20 via-lime-500/12 to-amber-500/10 text-emerald-50",
    amber:
      "border-amber-500/20 bg-gradient-to-br from-amber-500/14 to-orange-500/8 text-amber-50",
  } as const;

  return (
    <div className={`glass-card rounded-3xl border p-5 ${accentClasses[accent]}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">{label}</p>
      <p className="mt-3 text-xl sm:text-2xl lg:text-3xl font-bold break-all">{value}</p>
      <p className="mt-3 text-sm text-white/70">{note}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-black/10 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
        {value}
      </p>
    </div>
  );
}

function RecentOrdersSkeleton() {
  return (
    <div className="mt-6 animate-pulse space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-20 rounded-2xl border border-[var(--color-border)] bg-white/5"
        />
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="glass-card rounded-3xl border border-red-500/20 bg-red-500/5 p-5">
      <p className="text-sm font-semibold text-red-300">Dashboard data error</p>
      <p className="mt-2 text-sm text-red-200/80">{message}</p>
    </div>
  );
}

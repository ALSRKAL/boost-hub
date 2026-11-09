"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import AdminGuard from "@/components/admin/AdminGuard";
import SearchInput from "@/components/ui/SearchInput";
import { StatusBadge } from "@/components/ui/Badge";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonRows,
  Stat,
} from "@/components/ui/Primitives";
import { formatCurrency, formatNumber, USER_ROLES } from "@/lib/constants";
import { subscribeAllUsers, timestampToDate, type UserDoc } from "@/lib/db";
import { sumMoney } from "@/lib/money";

type RoleFilter = "all" | UserDoc["role"];

export default function AdminUsersPage() {
  return (
    <AdminGuard>
      <UsersContent />
    </AdminGuard>
  );
}

function UsersContent() {
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const deferredSearch = useDeferredValue(search);
  const query = deferredSearch.trim().toLowerCase();

  const handleLoadError = useCallback((error: Error) => {
    console.error("Failed to load users:", error);
    setLoadError("The user directory could not be loaded.");
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAllUsers(
      (nextUsers) => {
        setUsers(nextUsers);
        setLoading(false);
      },
      handleLoadError
    );

    return unsubscribe;
  }, [reloadKey, handleLoadError]);

  const counts = useMemo(
    () => ({
      all: users.length,
      admin: users.filter((user) => user.role === USER_ROLES.admin).length,
      users: users.filter((user) => user.role === USER_ROLES.user).length,
    }),
    [users]
  );

  const totalBalance = useMemo(
    () => sumMoney(users.map((user) => Number(user.balance ?? 0))),
    [users]
  );

  const visibleUsers = useMemo(
    () =>
      users.filter((user) => {
        if (roleFilter !== "all" && user.role !== roleFilter) return false;
        if (!query) return true;

        return [
          user.uid,
          user.email,
          user.displayName,
          user.role,
          formatCurrency(user.balance ?? 0),
        ].some((value) => String(value ?? "").toLowerCase().includes(query));
      }),
    [users, roleFilter, query]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Directory of every panel account, its role, and current balance."
        actions={
          <span className="num-sm text-ink-mute">
            {formatNumber(visibleUsers.length)} of {formatNumber(users.length)}
          </span>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Accounts" value={formatNumber(counts.all)} />
        <Stat label="Customers" value={formatNumber(counts.users)} />
        <Stat label="Admins" value={formatNumber(counts.admin)} />
        <Stat
          label="Total balance held"
          value={formatCurrency(totalBalance)}
          note="Sum of all account balances"
        />
      </section>

      <div className="space-y-3">
        <SearchInput
          label="Search users"
          value={search}
          onChange={setSearch}
          placeholder="Search by email, name, UID, role, or balance"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "all" as const, label: "All users", count: counts.all },
            { key: "user" as const, label: "Customers", count: counts.users },
            { key: "admin" as const, label: "Admins", count: counts.admin },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className="chip"
              aria-pressed={roleFilter === item.key}
              onClick={() => setRoleFilter(item.key)}
            >
              {item.label}
              <span className="chip-count">{formatNumber(item.count)}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : loadError ? (
        <ErrorState
          title="User directory unavailable"
          message={loadError}
          onRetry={() => {
            setLoading(true);
            setLoadError(null);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : visibleUsers.length === 0 ? (
        <EmptyState
          icon="users"
          title={users.length === 0 ? "No accounts yet" : "No users match"}
          description={
            users.length === 0
              ? "New customer accounts will appear here after their first sign-in."
              : "Change the role filter or clear the search."
          }
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="scroll-x hidden md:block">
            <table className="data-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Role</th>
                  <th className="cell-end">Balance</th>
                  <th>Joined</th>
                  <th>UID</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <tr key={user.uid}>
                    <td>
                      <p className="cell-strong max-w-[280px] truncate">
                        {user.email || "No email"}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-ink-mute">
                        {user.displayName || "No display name"}
                      </p>
                    </td>
                    <td>
                      <StatusBadge status={user.role} />
                    </td>
                    <td className="cell-end cell-num font-medium">
                      {formatCurrency(Number(user.balance ?? 0))}
                    </td>
                    <td className="cell-date whitespace-nowrap">
                      {timestampToDate(user.createdAt)}
                    </td>
                    <td>
                      <span className="num-sm text-[10.5px] text-ink-mute">
                        {user.uid}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-line md:hidden">
            {visibleUsers.map((user) => (
              <article key={user.uid} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-ink">
                      {user.email || "No email"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-mute">
                      {user.displayName || "No display name"}
                    </p>
                  </div>
                  <StatusBadge status={user.role} />
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
                  <span className="text-[11px] text-ink-mute">
                    Joined {timestampToDate(user.createdAt)}
                  </span>
                  <span className="num-sm font-medium text-ink">
                    {formatCurrency(Number(user.balance ?? 0))}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

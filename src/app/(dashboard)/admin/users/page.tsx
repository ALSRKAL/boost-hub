"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import AdminGuard from "@/components/admin/AdminGuard";
import {
  getAllUsers,
  timestampToDate,
  type UserDoc,
} from "@/lib/db";
import { formatCurrency, USER_ROLES } from "@/lib/constants";

export default function AdminUsersPage() {
  return (
    <AdminGuard>
      <AdminUsersContent />
    </AdminGuard>
  );
}

function AdminUsersContent() {
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      try {
        setLoading(true);
        setError(null);
        const nextUsers = await getAllUsers();

        if (!cancelled) {
          setUsers(nextUsers);
        }
      } catch (err) {
        console.error("Failed to load users:", err);
        if (!cancelled) {
          setError("Failed to load users. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedSearch = deferredSearch.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    if (!normalizedSearch) return users;
    return users.filter((user) =>
      user.email.toLowerCase().includes(normalizedSearch)
    );
  }, [users, normalizedSearch]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <section className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
          Admin Directory
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text-primary)]">
          Users
        </h1>
        <p className="max-w-3xl text-sm text-[var(--color-text-muted)]">
          Search the user base, monitor current balances, and verify account roles
          from one place.
        </p>
      </section>

      <section className="sticky top-20 z-20">
        <div className="glass-card rounded-3xl border border-[var(--color-border)] px-4 py-4 shadow-2xl shadow-black/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search users by email..."
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] pl-12 pr-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none transition-all duration-200 focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
              />
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Visible Users
              </p>
              <p className="mt-1 font-semibold text-[var(--color-text-primary)]">
                {filteredUsers.length}
              </p>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <UsersSkeleton />
      ) : error ? (
        <UsersError message={error} />
      ) : filteredUsers.length === 0 ? (
        <UsersEmpty hasSearch={normalizedSearch.length > 0} />
      ) : (
        <UsersTable users={filteredUsers} />
      )}
    </div>
  );
}

function UsersTable({ users }: { users: UserDoc[] }) {
  return (
    <div className="glass-card overflow-hidden rounded-3xl border border-[var(--color-border)]">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-[var(--color-bg-tertiary)]/55">
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                User Email
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Role
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Current Balance
              </th>
              <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Join Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {users.map((user) => (
              <tr
                key={user.uid}
                className="transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]/30"
              >
                <td className="px-5 py-4">
                  <div className="space-y-1">
                    <p className="font-medium text-[var(--color-text-primary)]">
                      {user.email}
                    </p>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {user.displayName || "No display name"}
                    </p>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${
                      user.role === USER_ROLES.admin
                        ? "border-purple-500/20 bg-purple-500/10 text-purple-300"
                        : "border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-[var(--color-accent)]">
                  {formatCurrency(user.balance ?? 0)}
                </td>
                <td className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">
                  {timestampToDate(user.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[var(--color-border)] lg:hidden">
        {users.map((user) => (
          <div key={user.uid} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {user.email}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {user.displayName || "No display name"}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold capitalize ${
                  user.role === USER_ROLES.admin
                    ? "border-purple-500/20 bg-purple-500/10 text-purple-300"
                    : "border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
                }`}
              >
                {user.role}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <UserMetaCard label="Balance" value={formatCurrency(user.balance ?? 0)} accent />
              <UserMetaCard label="Join Date" value={timestampToDate(user.createdAt)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserMetaCard({
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

function UsersSkeleton() {
  return (
    <div className="glass-card rounded-3xl p-5 space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-16 rounded-2xl animate-shimmer" />
      ))}
    </div>
  );
}

function UsersEmpty({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="glass-card rounded-3xl p-12 text-center">
      <span className="mb-4 block text-5xl">{hasSearch ? "🔎" : "👥"}</span>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        {hasSearch ? "No matching users" : "No users found"}
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {hasSearch
          ? "Try another email keyword."
          : "User accounts will appear here once they sign up."}
      </p>
    </div>
  );
}

function UsersError({ message }: { message: string }) {
  return (
    <div className="glass-card rounded-3xl p-12 text-center">
      <span className="mb-4 block text-5xl">⚠️</span>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Unable to load users
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{message}</p>
    </div>
  );
}

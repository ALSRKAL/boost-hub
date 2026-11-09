"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import AdminGuard from "@/components/admin/AdminGuard";
import { useLanguage } from "@/context/LanguageContext";
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
import { translateErrorMessage } from "@/lib/error-messages";

type RoleFilter = "all" | UserDoc["role"];

export default function AdminUsersPage() {
  return (
    <AdminGuard>
      <UsersContent />
    </AdminGuard>
  );
}

function UsersContent() {
  const { language, t } = useLanguage();
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
        eyebrow={t("Administration", "الإدارة")}
        title={t("Users", "المستخدمون")}
        description={t(
          "Directory of every panel account, its role, and current balance.",
          "دليل يعرض كل حساب في اللوحة ودوره ورصيده الحالي."
        )}
        actions={
          <span className="num-sm text-ink-mute">
            {formatNumber(visibleUsers.length)} {t("of", "من")}{" "}
            {formatNumber(users.length)}
          </span>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label={t("Accounts", "الحسابات")} value={formatNumber(counts.all)} />
        <Stat label={t("Customers", "العملاء")} value={formatNumber(counts.users)} />
        <Stat label={t("Admins", "المديرون")} value={formatNumber(counts.admin)} />
        <Stat
          label={t("Total balance held", "إجمالي الأرصدة")}
          value={formatCurrency(totalBalance)}
          note={t("Sum of all account balances", "مجموع أرصدة جميع الحسابات")}
        />
      </section>

      <div className="space-y-3">
        <SearchInput
          label={t("Search users", "بحث في المستخدمين")}
          value={search}
          onChange={setSearch}
          placeholder={t(
            "Search by email, name, UID, role, or balance",
            "ابحث بالبريد أو الاسم أو المعرف أو الدور أو الرصيد"
          )}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "all" as const, label: t("All users", "كل المستخدمين"), count: counts.all },
            { key: "user" as const, label: t("Customers", "العملاء"), count: counts.users },
            { key: "admin" as const, label: t("Admins", "المديرون"), count: counts.admin },
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
          title={t("User directory unavailable", "دليل المستخدمين غير متاح")}
          message={translateErrorMessage(loadError, language)}
          onRetry={() => {
            setLoading(true);
            setLoadError(null);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : visibleUsers.length === 0 ? (
        <EmptyState
          icon="users"
          title={
            users.length === 0
              ? t("No accounts yet", "لا توجد حسابات بعد")
              : t("No users match", "لا يوجد مستخدمون مطابقون")
          }
          description={
            users.length === 0
              ? t(
                  "New customer accounts will appear here after their first sign-in.",
                  "ستظهر حسابات العملاء الجديدة هنا بعد أول تسجيل دخول."
                )
              : t(
                  "Change the role filter or clear the search.",
                  "غيّر تصفية الدور أو امسح البحث."
                )
          }
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="scroll-x hidden md:block">
            <table className="data-table min-w-[820px]">
              <thead>
                <tr>
                  <th>{t("Account", "الحساب")}</th>
                  <th>{t("Role", "الدور")}</th>
                  <th className="cell-end">{t("Balance", "الرصيد")}</th>
                  <th>{t("Joined", "تاريخ الانضمام")}</th>
                  <th>{t("UID", "المعرف")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <tr key={user.uid}>
                    <td>
                      <p
                        className="cell-strong max-w-[280px] truncate"
                        data-i18n-ignore
                      >
                        {user.email || t("No email", "بلا بريد")}
                      </p>
                      <p
                        className="mt-0.5 text-[11.5px] text-ink-mute"
                        data-i18n-ignore
                      >
                        {user.displayName || t("No display name", "بلا اسم عرض")}
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
                    <p
                      className="truncate text-[12.5px] font-medium text-ink"
                      data-i18n-ignore
                    >
                      {user.email || t("No email", "بلا بريد")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-mute" data-i18n-ignore>
                      {user.displayName || t("No display name", "بلا اسم عرض")}
                    </p>
                  </div>
                  <StatusBadge status={user.role} />
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
                  <span className="text-[11px] text-ink-mute">
                    {t("Joined", "انضم في")} {timestampToDate(user.createdAt)}
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

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAgent } from "@/context/AgentContext";
import {
  formatCurrency,
  NAV_ITEMS,
  ADMIN_NAV_ITEMS,
  USER_ROLES,
} from "@/lib/constants";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";

function getCurrentLabel(pathname: string, language: "en" | "ar"): string {
  const allItems = [...NAV_ITEMS, ...ADMIN_NAV_ITEMS];
  const match = allItems
    .filter((item) =>
      item.href === "/dashboard"
        ? pathname === item.href
        : pathname.startsWith(item.href)
    )
    .sort((left, right) => right.href.length - left.href.length)[0];

  if (!match) return language === "ar" ? "لوحة" : "Panel";

  return language === "ar" ? match.labelAr : match.label;
}

export default function Header({ onOpenNav }: { onOpenNav: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userProfile, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { openAgent } = useAgent();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const email = user?.email ?? userProfile?.email ?? "";
  const initial = (email[0] ?? "U").toUpperCase();
  const isAdmin = userProfile?.role === USER_ROLES.admin;

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function handleSignOut() {
    try {
      setSigningOut(true);
      await logout();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenNav}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-xs)] text-ink-soft hover:bg-sunken hover:text-ink lg:hidden"
            aria-label={t("Open navigation", "فتح التنقل")}
          >
            <Icon name="menu" size={17} />
          </button>

          <div className="hidden min-w-0 sm:block">
            <p className="rule-label hidden sm:block">{t("Panel", "لوحة")}</p>
            <p className="truncate text-[13px] font-semibold text-ink">
              {getCurrentLabel(pathname, language)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <button
            type="button"
            onClick={openAgent}
            className="flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-ink-soft transition-colors hover:bg-sunken hover:text-ink sm:px-2"
            aria-label={t("Open order assistant", "فتح المساعد الذكي")}
            title={`${t("Order assistant", "المساعد الذكي")} · ⌘K`}
          >
            <Icon name="message" size={15} />
            <span className="hidden text-[12px] font-medium lg:inline">
              {t("Assistant", "المساعد")}
            </span>
            <kbd className="hidden rounded border border-line bg-surface px-1 py-0.5 font-mono text-[9px] text-ink-mute xl:inline">
              ⌘K
            </kbd>
          </button>

          <div
            role="group"
            aria-label={t("Language", "اللغة")}
            className="flex h-7 items-center rounded-[var(--radius-xs)] border border-line-strong bg-surface p-0.5"
          >
            <button
              type="button"
              onClick={() => setLanguage("en")}
              aria-pressed={language === "en"}
              aria-label={t("Switch to English", "التبديل إلى الإنجليزية")}
              className={`flex h-6 min-w-7 items-center justify-center rounded-[var(--radius-xs)] px-1.5 text-[10.5px] font-semibold transition-colors ${
                language === "en"
                  ? "bg-ink text-white"
                  : "text-ink-mute hover:text-ink"
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage("ar")}
              aria-pressed={language === "ar"}
              aria-label={t("Switch to Arabic", "التبديل إلى العربية")}
              className={`flex h-6 min-w-7 items-center justify-center rounded-[var(--radius-xs)] px-1.5 text-[11px] font-semibold transition-colors ${
                language === "ar"
                  ? "bg-ink text-white"
                  : "text-ink-mute hover:text-ink"
              }`}
            >
              ع
            </button>
          </div>

          <Link
            href="/add-funds"
            className="group flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2.5 transition-colors hover:border-ink-mute"
            aria-label={`${t("Balance", "الرصيد")} ${formatCurrency(
              userProfile?.balance ?? 0
            )}. ${t("Add funds", "إضافة رصيد")}`}
          >
            <Icon name="wallet" size={14} className="text-ink-mute" />
            <span className="hidden text-[11px] font-medium text-ink-mute sm:inline">
              {t("Balance", "الرصيد")}
            </span>
            <span className="num-sm font-semibold text-ink">
              {formatCurrency(userProfile?.balance ?? 0)}
            </span>
            <Icon
              name="plus"
              size={12}
              className="text-ink-mute transition-colors group-hover:text-ink"
            />
          </Link>

          <div className="hidden h-5 w-px bg-line sm:block" />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-9 items-center gap-2 rounded-[var(--radius-sm)] px-1.5 text-start transition-colors hover:bg-sunken"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t("Account menu", "قائمة الحساب")}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
                {initial}
              </span>
              <span className="hidden max-w-[140px] truncate text-[12px] text-ink-soft md:block">
                {email}
              </span>
              <Icon
                name="chevron-down"
                size={13}
                className="hidden text-ink-mute sm:block"
              />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute end-0 top-full z-50 mt-2 w-60 rounded-md border border-line-strong bg-surface p-1 shadow-[var(--shadow-pop)]"
              >
                <div className="border-b border-line px-2.5 py-2.5">
                  <p className="truncate text-[12.5px] font-medium text-ink">
                    {email || t("Signed in", "تم تسجيل الدخول")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-mute">
                    {isAdmin
                      ? t("Administrator", "مدير")
                      : t("Customer", "عميل")}
                  </p>
                </div>

                <div className="py-1">
                  <Link
                    href="/orders"
                    role="menuitem"
                    className="flex h-8 items-center gap-2 rounded-[var(--radius-xs)] px-2.5 text-[12.5px] text-ink-soft hover:bg-subtle hover:text-ink"
                  >
                    <Icon name="receipt" size={14} />
                    {t("Order history", "سجل الطلبات")}
                  </Link>
                  <Link
                    href="/add-funds"
                    role="menuitem"
                    className="flex h-8 items-center gap-2 rounded-[var(--radius-xs)] px-2.5 text-[12.5px] text-ink-soft hover:bg-subtle hover:text-ink"
                  >
                    <Icon name="wallet" size={14} />
                    {t("Add funds", "إضافة رصيد")}
                  </Link>
                </div>

                <div className="border-t border-line pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    fullWidth
                    isLoading={signingOut}
                    onClick={handleSignOut}
                    className="justify-start"
                    leadingIcon={<Icon name="logout" size={14} />}
                  >
                    {t("Sign out", "تسجيل الخروج")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

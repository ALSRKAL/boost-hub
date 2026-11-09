"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  APP_CONFIG,
  NAV_ITEMS,
  ADMIN_NAV_ITEMS,
  USER_ROLES,
  type NavItem,
} from "@/lib/constants";
import Icon from "@/components/ui/Icon";

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { language } = useLanguage();
  const label = language === "ar" ? item.labelAr : item.label;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`relative flex h-8 items-center gap-2.5 rounded-[var(--radius-xs)] px-2 text-[13px] font-medium transition-colors ${
        active
          ? "bg-sunken text-ink"
          : "text-ink-soft hover:bg-subtle hover:text-ink"
      } ${collapsed ? "justify-center" : ""}`}
    >
      {active ? (
        <span className="absolute inset-y-1 start-0 w-[2px] rounded-full bg-ink" />
      ) : null}
      <Icon name={item.icon} size={16} className="shrink-0" />
      <span className={collapsed ? "sr-only" : "truncate"}>{label}</span>
    </Link>
  );
}

function SidebarContent({
  collapsed,
  onNavigate,
  onToggleCollapsed,
  onCloseMobile,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const { userProfile } = useAuth();
  const { t } = useLanguage();
  const isAdmin = userProfile?.role === USER_ROLES.admin;

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`flex h-14 shrink-0 items-center border-b border-line ${
          collapsed ? "justify-center px-2" : "justify-between px-4"
        }`}
      >
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2.5"
          onClick={onNavigate}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-ink text-[12px] font-semibold text-white">
            B
          </span>
          {collapsed ? null : (
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-4 text-ink">
                {APP_CONFIG.name}
              </span>
              <span className="block text-[10.5px] leading-4 text-ink-mute">
                {t("Panel", "لوحة")}
              </span>
            </span>
          )}
        </Link>
        {onCloseMobile ? (
          <button
            type="button"
            onClick={onCloseMobile}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-xs)] text-ink-mute hover:bg-sunken hover:text-ink"
            aria-label={t("Close navigation", "إغلاق التنقل")}
          >
            <Icon name="x" size={16} />
          </button>
        ) : null}
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {collapsed ? null : (
          <p className="rule-label px-2 pb-1.5">{t("Workspace", "مساحة العمل")}</p>
        )}
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {isAdmin ? (
          <>
            <div className="my-3 border-t border-line" />
            {collapsed ? null : (
              <p className="rule-label px-2 pb-1.5">
                {t("Administration", "الإدارة")}
              </p>
            )}
            <div className="space-y-0.5">
              {ADMIN_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </>
        ) : null}
      </nav>

      <div className="shrink-0 border-t border-line p-2">
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={`flex h-8 w-full items-center gap-2.5 rounded-[var(--radius-xs)] px-2 text-[12px] font-medium text-ink-mute transition-colors hover:bg-subtle hover:text-ink ${
              collapsed ? "justify-center" : ""
            }`}
            aria-label={
              collapsed
                ? t("Expand navigation", "توسيع التنقل")
                : t("Collapse navigation", "طي التنقل")
            }
            title={collapsed ? t("Expand navigation", "توسيع التنقل") : undefined}
          >
            <Icon
              name={collapsed ? "chevron-right" : "chevron-left"}
              size={15}
              className="rtl:rotate-180"
            />
            <span className={collapsed ? "sr-only" : ""}>
              {t("Collapse", "طي")}
            </span>
          </button>
        ) : null}
        {collapsed ? null : (
          <p className="px-2 pb-1 pt-2 text-[10.5px] leading-4 text-ink-mute">
            {t(
              "Prices include the panel service margin.",
              "الأسعار تشمل هامش خدمة اللوحة."
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Sidebar({
  mobileOpen,
  onMobileClose,
  collapsed,
  onToggleCollapsed,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();

  useEffect(() => {
    if (mobileOpen) onMobileClose();
    // Close the drawer whenever the route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onMobileClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      <aside
        className={`fixed inset-y-0 start-0 z-40 hidden border-e border-line bg-surface lg:block ${
          collapsed ? "w-[60px]" : "w-[232px]"
        }`}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
        />
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-50 bg-ink/30 lg:hidden"
          onClick={onMobileClose}
          aria-label={t("Close navigation", "إغلاق التنقل")}
          tabIndex={-1}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 start-0 z-[60] w-[280px] border-e border-line bg-surface transition-transform duration-150 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen ? true : undefined}
      >
        <SidebarContent
          collapsed={false}
          onCloseMobile={onMobileClose}
          onNavigate={onMobileClose}
        />
      </aside>
    </>
  );
}

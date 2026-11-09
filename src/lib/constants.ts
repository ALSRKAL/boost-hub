// ============================================================
// Central configuration
// ============================================================

import type { IconName } from "@/components/ui/Icon";

export const APP_CONFIG = {
  name: "BoostHub",
  tagline: "Social media services panel",
  currency: {
    symbol: "₹",
    code: "INR",
    locale: "en-IN",
  },
  defaultBalance: 0,
} as const;

// ============================================================
// Navigation
// ============================================================

export interface NavItem {
  label: string;
  labelAr: string;
  href: string;
  icon: IconName;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", labelAr: "نظرة عامة", href: "/dashboard", icon: "dashboard" },
  { label: "New order", labelAr: "طلب جديد", href: "/new-order", icon: "plus" },
  { label: "Services", labelAr: "الخدمات", href: "/services", icon: "list" },
  { label: "Orders", labelAr: "الطلبات", href: "/orders", icon: "receipt" },
  { label: "Add funds", labelAr: "إضافة رصيد", href: "/add-funds", icon: "wallet" },
];

export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    label: "Deposits",
    labelAr: "الإيداعات",
    href: "/admin/deposits",
    icon: "bank",
    adminOnly: true,
  },
  {
    label: "All orders",
    labelAr: "كل الطلبات",
    href: "/admin/orders",
    icon: "receipt",
    adminOnly: true,
  },
  {
    label: "Users",
    labelAr: "المستخدمون",
    href: "/admin/users",
    icon: "users",
    adminOnly: true,
  },
];

// ============================================================
// Firestore collections
// ============================================================

export const COLLECTIONS = {
  users: "users",
  deposits: "deposits",
  orders: "orders",
  systemMetrics: "system_metrics",
} as const;

// ============================================================
// Roles
// ============================================================

export const USER_ROLES = {
  user: "user",
  admin: "admin",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// ============================================================
// Formatting
// ============================================================

const currencyFormatter = new Intl.NumberFormat(APP_CONFIG.currency.locale, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat(APP_CONFIG.currency.locale, {
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `${APP_CONFIG.currency.symbol}${currencyFormatter.format(safeAmount)}`;
}

/** Keeps the minus sign before the currency symbol: -₹50.00, not ₹-50.00. */
export function formatSignedCurrency(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return safeAmount < 0
    ? `-${formatCurrency(Math.abs(safeAmount))}`
    : formatCurrency(safeAmount);
}

export function formatNumber(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return integerFormatter.format(safeValue);
}

export function formatAverageTime(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  if (!trimmed) return "—";

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const minutes = Number.parseFloat(trimmed);

    if (minutes < 60) {
      return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(0)} min`;
    }

    if (minutes < 24 * 60) {
      const hours = Math.floor(minutes / 60);
      const rest = Math.round(minutes % 60);
      return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
    }

    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.round((minutes % (24 * 60)) / 60);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  return trimmed;
}

export function formatDate(date: Date | string | number | null | undefined): string {
  if (!date) return "—";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleDateString(APP_CONFIG.currency.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: Date | string | number | null | undefined): string {
  if (!date) return "—";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleString(APP_CONFIG.currency.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================
// Central Configuration — Single Source of Truth
// ============================================================

export const APP_CONFIG = {
  name: "BoostHub",
  tagline: "Premium Social Media Marketing Services",
  currency: {
    symbol: "₹",
    code: "INR",
    locale: "en-IN",
  },
  defaultBalance: 0,
  profitMargin: 2.0, // Multiplier for provider prices
} as const;

// ============================================================
// Navigation Items
// ============================================================

export interface NavItem {
  label: string;
  href: string;
  icon: string; // Emoji for now, can swap to Lucide icons later
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "📊" },
  { label: "New Order", href: "/new-order", icon: "🛒" },
  { label: "Services", href: "/services", icon: "📋" },
  { label: "Orders", href: "/orders", icon: "📦" },
  { label: "Add Funds", href: "/add-funds", icon: "💰" },
];

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Deposits", href: "/admin/deposits", icon: "🏦", adminOnly: true },
  { label: "Users", href: "/admin/users", icon: "👥", adminOnly: true },
];

// ============================================================
// Firestore Collection Names
// ============================================================

export const COLLECTIONS = {
  users: "users",
  deposits: "deposits",
  orders: "orders",
  systemMetrics: "system_metrics",
} as const;

// ============================================================
// User Roles
// ============================================================

export const USER_ROLES = {
  user: "user",
  admin: "admin",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// ============================================================
// Formatting Helpers
// ============================================================

export function formatCurrency(amount: number): string {
  return `${APP_CONFIG.currency.symbol}${amount.toLocaleString(APP_CONFIG.currency.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { formatCurrency } from "@/lib/constants";
import Button from "@/components/ui/Button";

export default function Header() {
  const { user, userProfile, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 w-full bg-[var(--color-bg-secondary)]/60 backdrop-blur-xl border-b border-[var(--color-border)]">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Left spacer for mobile hamburger */}
        <div className="w-10 lg:w-0" />

        {/* Right Section */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Balance Card */}
          <Link
            href="/add-funds"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-[var(--color-accent)]/10 to-[var(--color-accent-hover)]/10 border border-[var(--color-accent)]/20 hover:border-[var(--color-accent)]/40 transition-all duration-200 group min-w-0"
          >
            <span className="text-lg shrink-0">💰</span>
            <div className="min-w-0">
              <p className="text-xs text-[var(--color-text-muted)]">Balance</p>
              <p className="text-xs sm:text-sm font-bold text-[var(--color-accent)] group-hover:text-[var(--color-accent-hover)] transition-colors truncate">
                {formatCurrency(userProfile?.balance ?? 0)}
              </p>
            </div>
            <span className="ml-1 text-xs text-[var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity">
              +
            </span>
          </Link>

          {/* User Info */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-hover)] flex items-center justify-center text-white text-xs font-bold">
              {(user?.email?.[0] || "U").toUpperCase()}
            </div>
            <span className="text-sm text-[var(--color-text-secondary)] max-w-[120px] truncate">
              {user?.email}
            </span>
          </div>

          {/* Sign Out */}
          <Button variant="ghost" size="sm" onClick={logout}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </Button>
        </div>
      </div>
    </header>
  );
}

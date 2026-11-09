"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export interface AdminProviderInfo {
  balance: number | null;
  currency: string;
  profitMargin: number | null;
  profitPercent: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface ProviderPayload {
  balance?: unknown;
  currency?: unknown;
  profitMargin?: unknown;
  profitPercent?: unknown;
  error?: unknown;
}

function readMargin(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? value
    : null;
}

/**
 * Loads live provider balance plus the configured selling multiplier.
 * Margin is returned even when the provider balance request fails, because
 * financial reporting must not depend on provider uptime.
 */
export function useAdminProviderInfo(enabled: boolean): AdminProviderInfo {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState("INR");
  const [profitMargin, setProfitMargin] = useState<number | null>(null);
  const [profitPercent, setProfitPercent] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/provider", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | ProviderPayload
        | null;

      const nextMargin = readMargin(payload?.profitMargin);
      const nextPercent =
        typeof payload?.profitPercent === "number" &&
        Number.isFinite(payload.profitPercent)
          ? payload.profitPercent
          : nextMargin !== null
            ? Math.round((nextMargin - 1) * 100)
            : null;

      if (nextMargin !== null) setProfitMargin(nextMargin);
      if (nextPercent !== null) setProfitPercent(nextPercent);

      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Provider balance is unavailable.";
        throw new Error(message);
      }

      const nextBalance =
        typeof payload?.balance === "number" ? payload.balance : null;

      setBalance(nextBalance);
      setCurrency(
        typeof payload?.currency === "string" ? payload.currency : "INR"
      );
      setError(null);
    } catch (loadError) {
      console.error("Failed to load provider balance:", loadError);
      setBalance(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Provider balance is unavailable."
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void load();
  }, [load]);

  return {
    balance,
    currency,
    profitMargin,
    profitPercent,
    loading,
    error,
    refresh,
  };
}

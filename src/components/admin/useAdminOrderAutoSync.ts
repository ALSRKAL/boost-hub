"use client";

import { useEffect, useRef } from "react";
import { getFirebaseAuth } from "@/lib/firebase";

const LAST_SYNC_KEY = "smm:admin-order-auto-sync";
const CROSS_TAB_COOLDOWN_MS = 90_000;

interface UseAdminOrderAutoSyncOptions {
  enabled: boolean;
  intervalMs?: number;
  onSynced?: () => void;
}

/**
 * Runs the global provider sync while an admin page is open. The cooldown is
 * shared across tabs so multiple admin tabs do not multiply provider calls.
 */
export function useAdminOrderAutoSync({
  enabled,
  intervalMs = 120_000,
  onSynced,
}: UseAdminOrderAutoSyncOptions) {
  const onSyncedRef = useRef(onSynced);

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let inFlight = false;

    async function run() {
      if (
        cancelled ||
        inFlight ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      ) {
        return;
      }

      try {
        const lastSync = Number(window.localStorage.getItem(LAST_SYNC_KEY) ?? 0);

        if (Date.now() - lastSync < CROSS_TAB_COOLDOWN_MS) return;

        window.localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      } catch {
        // localStorage can be unavailable in private/locked-down contexts.
      }

      const currentUser = getFirebaseAuth().currentUser;

      if (!currentUser) return;

      inFlight = true;

      try {
        const token = await currentUser.getIdToken();

        if (cancelled) return;

        const response = await fetch("/api/cron/sync-orders", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        if (!response.ok) {
          console.warn("Admin order auto-sync returned", response.status);
          return;
        }

        onSyncedRef.current?.();
      } catch (error) {
        if (!cancelled) {
          console.error("Admin order auto-sync failed:", error);
        }
      } finally {
        inFlight = false;
      }
    }

    void run();

    const interval = window.setInterval(run, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void run();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs]);
}

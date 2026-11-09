"use client";

import { useEffect } from "react";
import { getFirebaseAuth } from "@/lib/firebase";

interface UseOrderAutoSyncOptions {
  userId: string | null | undefined;
  enabled: boolean;
  intervalMs?: number;
}

/**
 * Refreshes the signed-in customer's active orders from the provider without
 * a manual button. Firestore's existing onSnapshot listener repaints the UI.
 */
export function useOrderAutoSync({
  userId,
  enabled,
  intervalMs = 60_000,
}: UseOrderAutoSyncOptions) {
  useEffect(() => {
    if (!userId || !enabled) return;

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

      const currentUser = getFirebaseAuth().currentUser;

      if (!currentUser || currentUser.uid !== userId) return;

      inFlight = true;

      try {
        const token = await currentUser.getIdToken();

        if (cancelled) return;

        const response = await fetch("/api/orders/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId }),
          cache: "no-store",
        });

        if (!response.ok && response.status !== 429) {
          console.warn("Order auto-sync returned", response.status);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Order auto-sync failed:", error);
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
  }, [userId, enabled, intervalMs]);
}

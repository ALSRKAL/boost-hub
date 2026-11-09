/**
 * Refill eligibility — shared by the orders UI and the refill API.
 *
 * SMM providers embed the guarantee window in the service name, e.g.
 * "Instagram Likes [0-24 hrs] ♻ 30 Days Refill", "Lifetime ♻", "No Refill".
 * The parser turns that into hours; the state machine below decides whether
 * a given order can be refilled right now.
 */

export const REFILL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const LIFETIME_REFILL_HOURS = 999999;

// Providers use both "♻" and "♻️" (with the U+FE0F variation selector).
const REFILL_WORD = "(?:refill|♻\\uFE0F?)";

/**
 * Returns:
 * - positive hours for a timed refill window
 * - Infinity for lifetime refill
 * - 0 for "No Refill" or when the provider flag is false
 * - null when refill is supported but no window is stated
 */
export function parseRefillWindowHours(
  serviceName: string,
  supportsRefill: boolean
): number | null {
  if (!supportsRefill) {
    return 0;
  }

  if (
    new RegExp(
      `\\bno[\\s-]*(?:refill|♻\\uFE0F?)|\\bNR\\b|(?:refill|♻\\uFE0F?)[\\s-]*no\\b`,
      "i"
    ).test(serviceName)
  ) {
    return 0;
  }

  if (
    new RegExp(
      `\\blifetime[\\s-]*${REFILL_WORD}|${REFILL_WORD}[\\s-]*lifetime\\b`,
      "i"
    ).test(serviceName)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const units: Array<{ pattern: string; hours: number }> = [
    { pattern: "hours?", hours: 1 },
    { pattern: "days?", hours: 24 },
    { pattern: "weeks?", hours: 24 * 7 },
    { pattern: "months?", hours: 24 * 30 },
    { pattern: "years?", hours: 24 * 365 },
  ];

  for (const unit of units) {
    const regex = new RegExp(
      `(\\d+)\\s*${unit.pattern}\\s*${REFILL_WORD}|${REFILL_WORD}\\s*(\\d+)\\s*${unit.pattern}`,
      "i"
    );
    const match = serviceName.match(regex);

    if (match) {
      const value = Number.parseInt(match[1] ?? match[2] ?? "", 10);

      if (Number.isFinite(value) && value > 0) {
        return value * unit.hours;
      }
    }
  }

  return null;
}

// ============================================================
// State machine
// ============================================================

export interface RefillDateLike {
  toDate(): Date;
}

export interface RefillOrderLike {
  supportsRefill?: boolean | null;
  status: string;
  completedAt?: RefillDateLike | null;
  refillAvailableAt?: RefillDateLike | null;
  refillRequestedAt?: RefillDateLike | null;
  refillWindowHours?: number | null;
}

export type RefillState =
  | { kind: "unavailable"; reason: "no-refill" | "inactive" | "not-completed" }
  | { kind: "expired"; expiredAtMs: number }
  | { kind: "waiting"; availableAtMs: number }
  | { kind: "cooldown"; availableAtMs: number }
  | { kind: "available"; availableAtMs: number };

function toMs(value: RefillDateLike | null | undefined): number | null {
  if (!value) return null;

  try {
    const date = value.toDate();
    const ms = date.getTime();
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function getWindowHours(order: RefillOrderLike): number | null {
  const value = order.refillWindowHours;

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  if (value >= LIFETIME_REFILL_HOURS) {
    return Number.POSITIVE_INFINITY;
  }

  return value;
}

/**
 * First refill wait: 24 hours after completion, except for short guarantee
 * windows (24h or less), where waiting would consume the entire window.
 */
export function getFirstRefillWaitMs(windowHours: number | null): number {
  if (
    typeof windowHours === "number" &&
    Number.isFinite(windowHours) &&
    windowHours > 0 &&
    windowHours <= 24
  ) {
    return 0;
  }

  return REFILL_COOLDOWN_MS;
}

export function getRefillState(
  order: RefillOrderLike,
  nowMs: number = Date.now()
): RefillState {
  if (!order.supportsRefill) {
    return { kind: "unavailable", reason: "no-refill" };
  }

  if (order.status === "cancelled" || order.status === "failed") {
    return { kind: "unavailable", reason: "inactive" };
  }

  if (order.status !== "completed" && order.status !== "partial") {
    return { kind: "unavailable", reason: "not-completed" };
  }

  const windowHours = getWindowHours(order);

  if (windowHours === 0) {
    return { kind: "unavailable", reason: "no-refill" };
  }

  const completedAtMs = toMs(order.completedAt);

  if (completedAtMs !== null && windowHours !== null && windowHours !== Number.POSITIVE_INFINITY) {
    const expiredAtMs = completedAtMs + windowHours * 60 * 60 * 1000;

    if (nowMs > expiredAtMs) {
      return { kind: "expired", expiredAtMs };
    }
  }

  const refillRequestedAtMs = toMs(order.refillRequestedAt);

  if (refillRequestedAtMs !== null) {
    const availableAtMs = refillRequestedAtMs + REFILL_COOLDOWN_MS;

    if (nowMs < availableAtMs) {
      return { kind: "cooldown", availableAtMs };
    }

    return { kind: "available", availableAtMs };
  }

  const waitMs = getFirstRefillWaitMs(windowHours);

  if (waitMs === 0) {
    return { kind: "available", availableAtMs: completedAtMs ?? nowMs };
  }

  const storedAvailableAtMs = toMs(order.refillAvailableAt);
  const availableAtMs =
    storedAvailableAtMs ?? (completedAtMs !== null ? completedAtMs + waitMs : null);

  if (availableAtMs !== null && nowMs < availableAtMs) {
    return { kind: "waiting", availableAtMs };
  }

  return { kind: "available", availableAtMs: availableAtMs ?? nowMs };
}

export type RefillDeniedReason =
  | "no-refill"
  | "inactive"
  | "not-completed"
  | "expired"
  | "cooldown"
  | "waiting";

export interface RefillDecision {
  allowed: boolean;
  reason?: RefillDeniedReason;
  availableAtMs?: number;
}

export function canRequestRefill(
  order: RefillOrderLike,
  nowMs: number = Date.now()
): RefillDecision {
  const state = getRefillState(order, nowMs);

  switch (state.kind) {
    case "available":
      return { allowed: true };
    case "waiting":
      return { allowed: false, reason: "waiting", availableAtMs: state.availableAtMs };
    case "cooldown":
      return { allowed: false, reason: "cooldown", availableAtMs: state.availableAtMs };
    case "expired":
      return { allowed: false, reason: "expired" };
    case "unavailable":
      return { allowed: false, reason: state.reason };
  }
}

export function formatCountdown(
  ms: number,
  language: "en" | "ar" = "en"
): string {
  if (ms <= 0) return language === "ar" ? "الآن" : "now";

  const totalMinutes = Math.ceil(ms / (1000 * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  const dayUnit = language === "ar" ? "يوم" : "d";
  const hourUnit = language === "ar" ? "ساعة" : "h";
  const minuteUnit = language === "ar" ? "دقيقة" : "m";

  if (days > 0) parts.push(`${days}${language === "ar" ? " " : ""}${dayUnit}`);
  if (hours > 0)
    parts.push(`${hours}${language === "ar" ? " " : ""}${hourUnit}`);
  if (minutes > 0 && days === 0)
    parts.push(`${minutes}${language === "ar" ? " " : ""}${minuteUnit}`);

  return parts.join(" ") || (language === "ar" ? "أقل من دقيقة" : "<1m");
}

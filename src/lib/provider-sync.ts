import { fromMinor, toMinor } from "@/lib/money";

export type InternalOrderStatus =
  | "pending"
  | "processing"
  | "in_progress"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export interface NormalizedProviderStatus {
  orderStatus: InternalOrderStatus;
  shouldRefund: boolean;
}

/**
 * Normalizes every status spelling observed from SMM panels.
 * Cancellation/refund wins, then failure, then partial, then completion.
 */
export function normalizeProviderStatus(rawStatus: string): NormalizedProviderStatus {
  const normalized = String(rawStatus ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

  if (normalized.includes("chargeback") || normalized.includes("refund")) {
    return { orderStatus: "cancelled", shouldRefund: true };
  }

  if (normalized.includes("cancel")) {
    return { orderStatus: "cancelled", shouldRefund: true };
  }

  if (
    normalized.includes("fail") ||
    normalized.includes("error") ||
    normalized.includes("reject") ||
    normalized.includes("declin") ||
    normalized.includes("expired")
  ) {
    return { orderStatus: "failed", shouldRefund: true };
  }

  if (normalized.includes("partial") || normalized.includes("incomplete")) {
    return { orderStatus: "partial", shouldRefund: false };
  }

  if (
    normalized.includes("complete") ||
    normalized.includes("finish") ||
    normalized.includes("delivered") ||
    normalized === "done"
  ) {
    return { orderStatus: "completed", shouldRefund: false };
  }

  if (normalized.includes("processing")) {
    return { orderStatus: "processing", shouldRefund: false };
  }

  if (
    normalized.includes("progress") ||
    normalized.includes("active") ||
    normalized.includes("working")
  ) {
    return { orderStatus: "in_progress", shouldRefund: false };
  }

  // Pending, queued, waiting, on hold, or unknown: keep it active so a later
  // sync can resolve it instead of freezing the order forever.
  return { orderStatus: "pending", shouldRefund: false };
}

export interface PartialRefundCalculation {
  refundAmount: number;
  refundMinor: number;
  anomaly: string | null;
}

/**
 * Partial refund = unused share of the charged amount.
 * `remains` is the provider's undelivered quantity, not a ratio.
 */
export function calculatePartialRefund(input: {
  charge: number;
  quantity: number;
  remains: number | null | undefined;
}): PartialRefundCalculation {
  const chargeMinor = toMinor(input.charge);
  const quantity = Math.trunc(input.quantity);
  const remains = input.remains;

  if (chargeMinor <= 0) {
    return { refundAmount: 0, refundMinor: 0, anomaly: "Charge is not positive." };
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      refundAmount: 0,
      refundMinor: 0,
      anomaly: "Order quantity is invalid for a partial refund.",
    };
  }

  if (remains === null || remains === undefined || !Number.isFinite(remains)) {
    return {
      refundAmount: 0,
      refundMinor: 0,
      anomaly: "Partial status has no usable remains value.",
    };
  }

  if (remains < 0) {
    return {
      refundAmount: 0,
      refundMinor: 0,
      anomaly: `Provider reported negative remains (${remains}).`,
    };
  }

  if (remains > quantity) {
    return {
      refundAmount: 0,
      refundMinor: 0,
      anomaly: `Provider reported remains (${remains}) greater than quantity (${quantity}).`,
    };
  }

  if (remains === 0) {
    return { refundAmount: 0, refundMinor: 0, anomaly: null };
  }

  const refundMinor = Math.min(
    chargeMinor,
    Math.max(0, Math.round((remains / quantity) * chargeMinor))
  );

  return {
    refundAmount: fromMinor(refundMinor),
    refundMinor,
    anomaly: null,
  };
}

export function calculateRemainingFullRefund(input: {
  charge: number;
  alreadyRefunded: number;
}): number {
  return fromMinor(
    Math.max(0, toMinor(input.charge) - toMinor(input.alreadyRefunded))
  );
}

export function isRefundLocked(refundState: string | null | undefined): boolean {
  return refundState === "partially_refunded" || refundState === "refunded_to_user";
}

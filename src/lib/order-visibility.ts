import type { OrderDoc } from "@/lib/db";

const CRITICAL_PROVIDER_CODES = new Set([
  "BALANCE",
  "AUTH",
  "SUSPENDED",
  "AMBIGUOUS",
  "INVALID_ORDER",
  "REFUND_FAILED",
  "SYNC_FAILED",
]);

export function needsProviderReview(order: OrderDoc): boolean {
  return Boolean(
    order.needsReconciliation ||
      order.refundAnomaly ||
      (order.providerErrorCode && CRITICAL_PROVIDER_CODES.has(order.providerErrorCode))
  );
}

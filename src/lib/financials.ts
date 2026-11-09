import { fromMinor, roundMoney, toMinor } from "@/lib/money";

/**
 * Financial fields needed to realize an order's contribution.
 * Structural type so this module stays usable in client components without
 * pulling in the Firestore SDK.
 */
export interface FinancialOrder {
  status: string;
  charge?: number | null;
  providerCharge?: number | null;
  refundedAmount?: number | null;
  quantity?: number | null;
  remains?: number | null;
  refundState?: string | null;
}

export interface OrderFinancials {
  /** Customer revenue actually retained after refunds. */
  revenue: number;
  /** Provider cost for delivered/active units only. */
  providerCost: number;
  /** Revenue minus realized provider cost. */
  netProfit: number;
  /** Amount already refunded to the customer. */
  refunded: number;
  /** False for canceled/failed/refunded orders that contribute nothing. */
  realized: boolean;
}

const LOSS_STATUSES = new Set(["cancelled", "failed"]);

/**
 * Canceled, failed, and refunded orders are liabilities, not revenue, even if
 * the refund transaction has not landed yet. Counting the unrefunded charge
 * would inflate profit until the provider confirms.
 */
function isLostOrder(order: FinancialOrder): boolean {
  return (
    LOSS_STATUSES.has(order.status) ||
    order.refundState === "refunded_to_user"
  );
}

/**
 * Actual provider cost:
 * - 0 for canceled/failed/refunded orders.
 * - Proportional to delivered units for a partial order.
 * - Full provider charge for completed and active orders.
 *
 * Legacy orders that predate `providerCharge` fall back to the selling charge
 * divided by the configured multiplier so their profit is not overstated.
 */
function providerCostMinor(
  order: FinancialOrder,
  profitMargin: number
): number {
  const rawProviderCharge = order.providerCharge;
  const storedMinor =
    typeof rawProviderCharge === "number" && Number.isFinite(rawProviderCharge)
      ? Math.max(0, toMinor(rawProviderCharge))
      : Math.max(
          0,
          Math.round(
            toMinor(Number(order.charge ?? 0)) / Math.max(profitMargin, 1)
          )
        );

  if (order.status !== "partial") return storedMinor;

  const quantity = Math.trunc(Number(order.quantity ?? 0));
  const remains = Number(order.remains);

  if (quantity <= 0 || !Number.isFinite(remains) || remains < 0) {
    return storedMinor;
  }

  const delivered = Math.min(
    quantity,
    Math.max(0, quantity - Math.trunc(remains))
  );

  return Math.round((storedMinor * delivered) / quantity);
}

export function calculateOrderFinancials(
  order: FinancialOrder,
  profitMargin: number
): OrderFinancials {
  const chargeMinor = Math.max(0, toMinor(Number(order.charge ?? 0)));
  const refundedMinor = Math.min(
    chargeMinor,
    Math.max(0, toMinor(Number(order.refundedAmount ?? 0)))
  );
  const lost = isLostOrder(order);

  const revenueMinor = lost
    ? 0
    : Math.max(0, chargeMinor - refundedMinor);
  const costMinor = lost ? 0 : providerCostMinor(order, profitMargin);

  return {
    revenue: fromMinor(revenueMinor),
    providerCost: fromMinor(costMinor),
    netProfit: fromMinor(revenueMinor - costMinor),
    refunded: fromMinor(refundedMinor),
    realized: !lost,
  };
}

export interface FinancialSummary {
  revenue: number;
  providerCost: number;
  netProfit: number;
  refunded: number;
}

export function summariseOrderFinancials(
  orders: FinancialOrder[],
  profitMargin: number
): FinancialSummary {
  const totals = orders.reduce(
    (accumulator, order) => {
      const financials = calculateOrderFinancials(order, profitMargin);

      return {
        revenue: accumulator.revenue + toMinor(financials.revenue),
        providerCost:
          accumulator.providerCost + toMinor(financials.providerCost),
        netProfit: accumulator.netProfit + toMinor(financials.netProfit),
        refunded: accumulator.refunded + toMinor(financials.refunded),
      };
    },
    { revenue: 0, providerCost: 0, netProfit: 0, refunded: 0 }
  );

  return {
    revenue: fromMinor(totals.revenue),
    providerCost: fromMinor(totals.providerCost),
    netProfit: roundMoney(fromMinor(totals.netProfit)),
    refunded: fromMinor(totals.refunded),
  };
}

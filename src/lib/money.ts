// ============================================================
// Money — integer-minor-unit arithmetic
// All calculations run in paise (1 INR = 100 paise) and only
// convert back to major units at the boundary.
// ============================================================

export function toMinor(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  // Compensate for binary representations such as 1.005 * 100 = 100.4999…
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromMinor(minor: number): number {
  if (!Number.isFinite(minor)) return 0;
  return minor / 100;
}

export function roundMoney(amount: number): number {
  return fromMinor(toMinor(amount));
}

/**
 * Charge for a per-1000 rate.
 * Rounds to the nearest paise once, after integer multiplication.
 * `minimumMinor` keeps a positive-rate order from rounding down to ₹0.00.
 */
export function calculateCharge(
  ratePerThousand: number,
  quantity: number,
  options: { minimumMinor?: number } = {}
): number {
  const rateMinor = toMinor(ratePerThousand);
  const units = Math.trunc(quantity);

  if (rateMinor <= 0 || units <= 0) return 0;

  const computedMinor = Math.round((rateMinor * units) / 1000);

  if (computedMinor > 0) {
    return fromMinor(computedMinor);
  }

  return fromMinor(Math.max(0, Math.trunc(options.minimumMinor ?? 0)));
}

export function sumMoney(values: number[]): number {
  return fromMinor(values.reduce((total, value) => total + toMinor(value), 0));
}


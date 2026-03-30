/**
 * Refill window parsing and countdown utilities.
 *
 * SMM providers embed refill information in the service name.
 * Examples:
 *   - "Instagram Likes [0-24 hrs] ♻ 30 Days Refill"
 *   - "Instagram Followers | 30 Days ♻ | Low Drop"
 *   - "YouTube Subscribers - Lifetime Refill"
 *   - "Followers | Lifetime ♻ | Real"
 *   - "TikTok Views - No Refill"
 *   - "Followers [ ♻ No REFILL ] [0-24 hrs]"
 *   - "Instagram Followers [0-6 hrs] ♻ 365 Days Refill"
 *   - "Followers | 1 Year ♻ | Instant"
 *
 * This module extracts the refill window (in hours) so we can compute
 * when refill becomes available after an order completes.
 */

// The ♻ emoji is used interchangeably with the word "Refill" in SMM service names
const REFILL_WORD = "(?:refill|♻)";

/**
 * Parse the refill window in hours from a provider service name.
 *
 * Returns:
 *   - A positive number of hours for timed refills (e.g. 720 for "30 Days Refill")
 *   - `Infinity` for "Lifetime Refill" (refill always available once eligible)
 *   - `0` for "No Refill" or when refill flag is false
 *   - `null` when no refill info could be parsed (fallback to supportsRefill flag)
 */
export function parseRefillWindowHours(
  serviceName: string,
  supportsRefill: boolean
): number | null {
  if (!supportsRefill) {
    return 0;
  }

  // Check for "No Refill" / "No ♻" / "♻ No Refill" — must be checked first
  if (/\bno[\s-]*(?:refill|♻)|(?:refill|♻)[\s-]*no\b/i.test(serviceName)) {
    return 0;
  }

  // Check for "Lifetime Refill" or "Lifetime ♻" (in any order)
  if (new RegExp(`\\blifetime[\\s-]*${REFILL_WORD}|${REFILL_WORD}[\\s-]*lifetime\\b`, "i").test(serviceName)) {
    return Infinity;
  }

  // Parse day patterns (both orders):
  //   "30 Days Refill", "30 Days ♻", "♻ 30 Days", "Refill 30 Days"
  const daysRe = new RegExp(
    `(\\d+)\\s*days?\\s*${REFILL_WORD}|${REFILL_WORD}\\s*(\\d+)\\s*days?`,
    "i"
  );
  const daysMatch = serviceName.match(daysRe);
  if (daysMatch) {
    const days = parseInt(daysMatch[1] ?? daysMatch[2], 10);
    if (Number.isFinite(days) && days > 0) {
      return days * 24;
    }
  }

  // Parse month patterns:
  //   "3 Months Refill", "3 Months ♻", "♻ 3 Months"
  const monthsRe = new RegExp(
    `(\\d+)\\s*months?\\s*${REFILL_WORD}|${REFILL_WORD}\\s*(\\d+)\\s*months?`,
    "i"
  );
  const monthsMatch = serviceName.match(monthsRe);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1] ?? monthsMatch[2], 10);
    if (Number.isFinite(months) && months > 0) {
      return months * 30 * 24;
    }
  }

  // Parse year patterns:
  //   "1 Year Refill", "1 Year ♻", "♻ 1 Year", "2 Years Refill"
  const yearRe = new RegExp(
    `(\\d+)\\s*years?\\s*${REFILL_WORD}|${REFILL_WORD}\\s*(\\d+)\\s*years?`,
    "i"
  );
  const yearMatch = serviceName.match(yearRe);
  if (yearMatch) {
    const years = parseInt(yearMatch[1] ?? yearMatch[2], 10);
    if (Number.isFinite(years) && years > 0) {
      return years * 365 * 24;
    }
  }

  // If supportsRefill is true but we found no specific window,
  // return null to indicate "refill supported, window unknown"
  // The UI will allow refill indefinitely after completion with 24h cooldown.
  return null;
}

/**
 * Compute how many milliseconds remain until refill becomes available.
 *
 * @param completedAtMs - Timestamp (in ms) when the order was completed
 * @param refillWindowHours - The refill window in hours (from parseRefillWindowHours)
 * @param nowMs - Current time in ms (defaults to Date.now())
 *
 * Returns:
 *   - 0 if refill is available now
 *   - positive number of milliseconds remaining
 *   - -1 if refill is not supported
 */
export function computeRefillCountdownMs(
  completedAtMs: number,
  refillWindowHours: number | null,
  nowMs: number = Date.now()
): number {
  // No refill support
  if (refillWindowHours === 0) {
    return -1;
  }

  // Lifetime refill or unknown window: immediately available after completion
  if (refillWindowHours === Infinity || refillWindowHours === null) {
    return 0;
  }

  // After this many ms from completion, the refill window (the period in which
  // the refill claim can be made) is considered active.
  // Provider logic: the "X Days Refill" means the service guarantees a refill
  // period of X days from completion. Refill becomes available once order completes
  // but NOT before 24 hours from completion (standard SMM provider waiting period).
  const MINIMUM_WAIT_HOURS = 24;
  const waitMs = MINIMUM_WAIT_HOURS * 60 * 60 * 1000;
  const availableAt = completedAtMs + waitMs;

  const remaining = availableAt - nowMs;

  return Math.max(0, remaining);
}

/**
 * Compute the refill expiry timestamp — the deadline after which refill
 * can no longer be requested.
 *
 * @returns expiry time in ms, or Infinity for lifetime refill, or 0 for no refill
 */
export function computeRefillExpiryMs(
  completedAtMs: number,
  refillWindowHours: number | null
): number {
  if (refillWindowHours === 0) {
    return 0;
  }

  if (refillWindowHours === Infinity || refillWindowHours === null) {
    return Infinity;
  }

  return completedAtMs + refillWindowHours * 60 * 60 * 1000;
}

/**
 * Format a countdown in milliseconds to a human-readable string.
 * Examples: "23 hours 49 minutes", "1 day 5 hours", "45 minutes"
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) {
    return "Available now";
  }

  const totalMinutes = Math.ceil(ms / (1000 * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  }

  if (hours > 0) {
    parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
  }

  if (minutes > 0 && days === 0) {
    parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
  }

  return parts.length > 0 ? parts.join(" ") : "Less than a minute";
}

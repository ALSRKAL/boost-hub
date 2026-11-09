import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { calculateCharge, roundMoney } from "@/lib/money";

// ============================================================
// Provider payloads
// ============================================================

type ProviderFlag = boolean | string | number | null | undefined;

export interface ProviderService {
  service?: string | number;
  name?: string;
  category?: string;
  rate?: string | number;
  min?: string | number;
  max?: string | number;
  type?: string;
  refill?: ProviderFlag;
  cancel?: ProviderFlag;
  dripfeed?: ProviderFlag;
  average_time?: string | number;
  avg_time?: string | number;
}

export interface PublicService {
  id: string;
  name: string;
  category: string;
  price: string;
  min: number;
  max: number;
  type: string;
  refill: boolean;
  cancel: boolean;
  dripfeed: boolean;
  averageTime: string | null;
}

export interface ProviderOrderStatus {
  orderId: string;
  status: string;
  charge?: number;
  startCount?: number;
  remains?: number;
}

export interface ProviderBalance {
  balance: number;
  currency?: string;
}

export interface CreateProviderOrderInput {
  serviceId: string;
  link: string;
  quantity: number;
  comments?: string;
  username?: string;
  runs?: number;
  interval?: number;
}

export interface ProviderStatusBatchResult {
  statuses: Record<string, ProviderOrderStatus>;
  errors: Record<string, string>;
}

export type ProviderOperation =
  | "services"
  | "balance"
  | "add"
  | "status"
  | "refill"
  | "cancel";

export type ProviderErrorCode =
  | "BALANCE"
  | "AUTH"
  | "SUSPENDED"
  | "UPSTREAM"
  | "INVALID_TARGET"
  | "INVALID_QUANTITY"
  | "SERVICE_NOT_FOUND"
  | "DUPLICATE_ORDER"
  | "INVALID_ORDER"
  | "REFILL_UNAVAILABLE"
  | "ALREADY_REFILLED"
  | "CANCEL_UNAVAILABLE"
  | "AMBIGUOUS"
  | "NETWORK"
  | "UNKNOWN";

const CUSTOMER_MESSAGES: Record<ProviderErrorCode, string> = {
  BALANCE: "This service is temporarily unavailable.",
  AUTH: "This service is temporarily unavailable. Please try again later.",
  SUSPENDED: "This service is temporarily unavailable. Please try again later.",
  UPSTREAM: "The service provider is temporarily unavailable. Please try again shortly.",
  INVALID_TARGET:
    "The target link or username was rejected. Check that it is public and correct.",
  INVALID_QUANTITY:
    "The quantity was rejected for this service. Check the allowed minimum and maximum.",
  SERVICE_NOT_FOUND: "This service is no longer available. Refresh the catalog.",
  DUPLICATE_ORDER:
    "This link already has an active order for this service. Wait for it to finish before ordering again.",
  INVALID_ORDER:
    "The provider could not find this order. It may still be processing.",
  REFILL_UNAVAILABLE: "Refill is not available for this order right now.",
  ALREADY_REFILLED: "This order was already refilled for this period.",
  CANCEL_UNAVAILABLE: "This order can no longer be canceled.",
  AMBIGUOUS:
    "The provider did not confirm the request. Do not resubmit; support will reconcile it.",
  NETWORK: "The service provider could not be reached. Please try again.",
  UNKNOWN: "The service provider rejected the request. Please try again.",
};

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly rawMessage: string;
  readonly customerMessage: string;
  readonly safeToRefund: boolean;
  readonly ambiguous: boolean;
  readonly httpStatus?: number;
  readonly operation: ProviderOperation;

  constructor(input: {
    code: ProviderErrorCode;
    rawMessage: string;
    operation: ProviderOperation;
    customerMessage?: string;
    safeToRefund?: boolean;
    ambiguous?: boolean;
    httpStatus?: number;
  }) {
    super(input.rawMessage);
    this.name = "ProviderError";
    this.code = input.code;
    this.rawMessage = input.rawMessage;
    this.customerMessage =
      input.customerMessage ?? CUSTOMER_MESSAGES[input.code];
    this.safeToRefund = input.safeToRefund ?? true;
    this.ambiguous = input.ambiguous ?? false;
    this.httpStatus = input.httpStatus;
    this.operation = input.operation;
  }
}

export function getCustomerProviderMessage(
  error: unknown,
  fallback = "The service provider rejected the request. Please try again."
): string {
  return error instanceof ProviderError ? error.customerMessage : fallback;
}

export function isCriticalProviderError(code: string | null | undefined): boolean {
  return [
    "BALANCE",
    "AUTH",
    "SUSPENDED",
    "AMBIGUOUS",
    "INVALID_ORDER",
    "REFUND_FAILED",
  ].includes(code ?? "");
}

// ============================================================
// SSRF-safe provider configuration
// ============================================================

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isPrivateIPv6(host: string): boolean {
  const normalized = host.toLowerCase();

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) === 4 ? isPrivateIPv4(mapped) : true;
  }

  return false;
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);

  // Hostnames are not IPs; only resolved addresses and IP literals are checked.
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);

  return false;
}

async function validateProviderUrl(raw: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("The provider URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The provider URL must use http or https.");
  }

  if (url.username || url.password) {
    throw new Error("The provider URL must not contain credentials.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal" ||
    isPrivateAddress(hostname)
  ) {
    throw new Error("The provider host is not allowed.");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error("The provider host resolves to a private or reserved address.");
  }

  return url;
}

let providerConfigPromise: Promise<{ baseUrl: URL; apiKey: string }> | null = null;

function getProviderConfig(): Promise<{ baseUrl: URL; apiKey: string }> {
  if (!providerConfigPromise) {
    providerConfigPromise = (async () => {
      const rawUrl = process.env.SMM_PROVIDER_API_URL;
      const apiKey = process.env.SMM_PROVIDER_API_KEY;

      if (!rawUrl || !apiKey) {
        throw new Error("Services provider is not configured.");
      }

      return { baseUrl: await validateProviderUrl(rawUrl), apiKey };
    })().catch((error) => {
      providerConfigPromise = null;
      throw error;
    });
  }

  return providerConfigPromise;
}

// ============================================================
// Error classification & HTTP transport
// ============================================================

function includesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function classifyProviderError(
  rawMessage: string,
  operation: ProviderOperation,
  options: { httpStatus?: number; ambiguous?: boolean } = {}
): ProviderError {
  const message = rawMessage.trim() || "The provider returned an unspecified error.";
  const lower = message.toLowerCase();

  const create = (
    code: ProviderErrorCode,
    overrides: Partial<{
      safeToRefund: boolean;
      ambiguous: boolean;
      customerMessage: string;
    }> = {}
  ) =>
    new ProviderError({
      code,
      rawMessage: message,
      operation,
      httpStatus: options.httpStatus,
      ...overrides,
    });

  if (
    includesAny(lower, [
      /out of balance/,
      /not enough funds/,
      /insufficient balance/,
      /low balance/,
      /recharge your balance/,
    ])
  ) {
    return create("BALANCE");
  }

  if (
    includesAny(lower, [
      /invalid api key/,
      /incorrect api key/,
      /api key/,
      /unauthorized/,
      /authentication/,
      /access denied/,
      /invalid key/,
      /wrong key/,
      /not authorized/,
    ])
  ) {
    return create("AUTH");
  }

  if (includesAny(lower, [/suspended/, /banned/, /blocked/, /disabled/, /terminated/])) {
    return create("SUSPENDED");
  }

  if (includesAny(lower, [/already.*refill/, /refill.*already/, /no more refill/])) {
    return create("ALREADY_REFILLED", {
      customerMessage: "This order was already refilled for this period.",
    });
  }

  if (
    includesAny(lower, [
      /refill.*not.*(available|possible|allowed|completed|complete)/,
      /not.*(available|possible|allowed).*refill/,
      /refill.*(reject|fail|error|unavailable)/,
      /non-completed/,
    ])
  ) {
    return create("REFILL_UNAVAILABLE");
  }

  if (
    includesAny(lower, [
      /cancel.*not.*(available|possible|allowed)/,
      /cannot.*cancel/,
      /can not.*cancel/,
      /cancel.*(reject|fail|error)/,
    ])
  ) {
    return create("CANCEL_UNAVAILABLE");
  }

  if (
    includesAny(lower, [
      /already in work/,
      /duplicate order/,
      /link.*already.*(work|order|progress)/,
      /already.*(has|have).*order/,
    ])
  ) {
    return create("DUPLICATE_ORDER");
  }

  if (
    includesAny(lower, [
      /incorrect order/,
      /order id/,
      /order not found/,
      /unknown order/,
      /invalid order/,
    ])
  ) {
    return create("INVALID_ORDER");
  }

  if (includesAny(lower, [/private/, /profile is private/])) {
    return create("INVALID_TARGET", {
      customerMessage:
        "The target profile is private. Make it public and try again.",
    });
  }

  if (
    includesAny(lower, [
      /invalid link/,
      /incorrect link/,
      /wrong link/,
      /link is not/,
      /invalid url/,
      /incorrect url/,
      /invalid target/,
      /invalid username/,
      /incorrect username/,
      /user not found/,
      /enter (?:a )?valid (?:link|url|username|target)/,
      /not a valid (?:link|url|username|target)/,
      /(?:link|url|username|target).*not valid/,
    ])
  ) {
    return create("INVALID_TARGET");
  }

  if (
    includesAny(lower, [
      /quantity/,
      /\bmin(imum)?\b/,
      /\bmax(imum)?\b/,
      /less than/,
      /greater than/,
      /too few/,
      /too many/,
    ])
  ) {
    return create("INVALID_QUANTITY");
  }

  if (
    includesAny(lower, [
      /service is not/,
      /incorrect service/,
      /service not/,
      /invalid service/,
      /service id/,
      /service type/,
    ])
  ) {
    return create("SERVICE_NOT_FOUND");
  }

  if (
    includesAny(lower, [
      /server error/,
      /internal/,
      /database/,
      /cloudflare/,
      /bad gateway/,
      /gateway/,
      /timed? ?out/,
      /try again/,
      /temporar/,
      /maintenance/,
      /unavailable/,
      /http 5\d\d/,
      /<html/,
    ])
  ) {
    return create("UPSTREAM", { safeToRefund: !options.ambiguous, ambiguous: options.ambiguous });
  }

  return create(options.ambiguous ? "AMBIGUOUS" : "UNKNOWN", {
    safeToRefund: !options.ambiguous,
    ambiguous: options.ambiguous,
  });
}

function classifyTransportError(
  error: unknown,
  operation: ProviderOperation
): ProviderError {
  const name = error instanceof Error ? error.name : "";
  const causeCode = String(
    (error as { cause?: { code?: unknown } })?.cause?.code ?? ""
  );
  const rawMessage =
    error instanceof Error ? error.message : "Provider request failed.";

  const preDispatchCodes = ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"];
  const isPreDispatch = preDispatchCodes.includes(causeCode);
  const isTimeout = name === "TimeoutError" || name === "AbortError";
  const isAmbiguousAdd = operation === "add" && !isPreDispatch;

  if (isAmbiguousAdd) {
    return new ProviderError({
      code: "AMBIGUOUS",
      rawMessage: `${isTimeout ? "Provider timeout" : "Provider connection failed"}: ${rawMessage}${
        causeCode ? ` (${causeCode})` : ""
      }`,
      operation,
      safeToRefund: false,
      ambiguous: true,
    });
  }

  return new ProviderError({
    code: isPreDispatch ? "NETWORK" : "UPSTREAM",
    rawMessage: `Provider transport error: ${rawMessage}${
      causeCode ? ` (${causeCode})` : ""
    }`,
    operation,
    safeToRefund: true,
    ambiguous: false,
  });
}

function parseJsonSafely(text: string): unknown {
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function providerRequest(input: {
  operation: ProviderOperation;
  action: string;
  method?: "GET" | "POST";
  params?: Record<string, string | number | undefined>;
  timeoutMs: number;
}): Promise<unknown> {
  const { baseUrl, apiKey } = await getProviderConfig();
  const method = input.method ?? "POST";
  const params = input.params ?? {};

  let target = baseUrl.toString();
  let body: URLSearchParams | undefined;

  if (method === "GET") {
    const url = new URL(baseUrl.toString());
    url.searchParams.set("action", input.action);
    url.searchParams.set("key", apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    target = url.toString();
  } else {
    body = new URLSearchParams({ key: apiKey, action: input.action });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) body.set(key, String(value));
    }
  }

  let response: Response;

  try {
    response = await fetch(target, {
      method,
      headers: {
        Accept: "application/json",
        ...(method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      ...(body ? { body } : {}),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch (error) {
    throw classifyTransportError(error, input.operation);
  }

  let text = "";

  try {
    text = await response.text();
  } catch (error) {
    throw classifyTransportError(error, input.operation);
  }

  const payload = parseJsonSafely(text);
  const providerError =
    payload && typeof payload === "object" && "error" in payload
      ? typeof payload.error === "string"
        ? payload.error
        : JSON.stringify(payload.error)
      : null;

  if (!response.ok) {
    const raw = providerError ?? `Provider returned HTTP ${response.status}.`;

    if (input.operation === "add" && response.status >= 500) {
      throw new ProviderError({
        code: "AMBIGUOUS",
        rawMessage: raw,
        operation: input.operation,
        safeToRefund: false,
        ambiguous: true,
        httpStatus: response.status,
      });
    }

    throw classifyProviderError(raw, input.operation, {
      httpStatus: response.status,
    });
  }

  if (providerError) {
    throw classifyProviderError(providerError, input.operation, {
      httpStatus: response.status,
    });
  }

  if (payload === null || typeof payload === "string") {
    const raw = `Malformed provider response: ${text.slice(0, 240) || "(empty)"}`;

    if (input.operation === "add") {
      throw new ProviderError({
        code: "AMBIGUOUS",
        rawMessage: raw,
        operation: input.operation,
        safeToRefund: false,
        ambiguous: true,
        httpStatus: response.status,
      });
    }

    throw new ProviderError({
      code: "UPSTREAM",
      rawMessage: raw,
      operation: input.operation,
      httpStatus: response.status,
    });
  }

  return payload;
}

// ============================================================
// Mapping & pricing
// ============================================================

function toBoolean(value: ProviderFlag): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return false;
}

export function parseProviderNumber(
  value: string | number | undefined,
  fallback = 0
): number {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Multiplier applied to the provider rate — never a percentage.
 * `SMM_PROFIT_MARGIN=2.0` means selling rate = provider rate × 2
 * (a 100% markup). Values below 1× would sell below cost and are rejected.
 */
export function getProfitMargin(): number {
  const parsed = Number.parseFloat(process.env.SMM_PROFIT_MARGIN ?? "");
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 2.0;
}

export function calculateSellingRate(providerRate: number): number {
  if (!(providerRate > 0)) return 0;

  // A positive provider rate must never collapse to a free (₹0.00) listing.
  return Math.max(0.01, roundMoney(providerRate * getProfitMargin()));
}

export function calculateTotalCost(
  sellingRatePerThousand: number,
  quantity: number
): number {
  return calculateCharge(sellingRatePerThousand, quantity);
}

export function mapProviderServiceToPublic(
  service: ProviderService
): PublicService | null {
  if (!service.service || !service.name || !service.category) {
    return null;
  }

  const providerRate = parseProviderNumber(service.rate);
  const averageTimeRaw = service.average_time ?? service.avg_time;

  return {
    id: String(service.service),
    name: service.name.trim(),
    category: service.category.trim(),
    price: calculateSellingRate(providerRate).toFixed(2),
    min: Math.max(1, Math.trunc(parseProviderNumber(service.min, 1))),
    max: Math.max(1, Math.trunc(parseProviderNumber(service.max, 1))),
    type: service.type?.trim() || "default",
    refill: toBoolean(service.refill),
    cancel: toBoolean(service.cancel),
    dripfeed: toBoolean(service.dripfeed),
    averageTime:
      averageTimeRaw === undefined || averageTimeRaw === null
        ? null
        : String(averageTimeRaw).trim() || null,
  };
}

// ============================================================
// Provider endpoints
// ============================================================

const TIMEOUTS = {
  services: 20_000,
  balance: 10_000,
  add: 25_000,
  status: 15_000,
  refill: 15_000,
  cancel: 15_000,
} as const;

export async function fetchProviderServices(): Promise<ProviderService[]> {
  const payload = await providerRequest({
    operation: "services",
    action: "services",
    method: "GET",
    timeoutMs: TIMEOUTS.services,
  });

  if (!Array.isArray(payload)) {
    throw new ProviderError({
      code: "UPSTREAM",
      rawMessage: "Invalid services response: expected an array.",
      operation: "services",
    });
  }

  return payload as ProviderService[];
}

export async function fetchProviderBalance(): Promise<ProviderBalance> {
  const payload = await providerRequest({
    operation: "balance",
    action: "balance",
    method: "GET",
    timeoutMs: TIMEOUTS.balance,
  });

  if (!payload || typeof payload !== "object" || !("balance" in payload)) {
    throw new ProviderError({
      code: "UPSTREAM",
      rawMessage: "Invalid balance response: missing balance.",
      operation: "balance",
    });
  }

  const currency =
    "currency" in payload && typeof payload.currency === "string"
      ? payload.currency
      : undefined;

  return {
    balance: parseProviderNumber(payload.balance as string | number | undefined),
    currency,
  };
}

export async function createProviderOrder(
  input: CreateProviderOrderInput
): Promise<string> {
  const payload = await providerRequest({
    operation: "add",
    action: "add",
    timeoutMs: TIMEOUTS.add,
    params: {
      service: input.serviceId,
      link: input.link,
      quantity: input.quantity,
      comments: input.comments?.trim() || undefined,
      username: input.username?.trim() || undefined,
      runs:
        typeof input.runs === "number" && input.runs > 0 ? input.runs : undefined,
      interval:
        typeof input.interval === "number" && input.interval > 0
          ? input.interval
          : undefined,
    },
  });

  if (
    payload &&
    typeof payload === "object" &&
    "order" in payload &&
    (typeof payload.order === "string" || typeof payload.order === "number")
  ) {
    return String(payload.order);
  }

  throw new ProviderError({
    code: "AMBIGUOUS",
    rawMessage: "Malformed add response: missing order id.",
    operation: "add",
    safeToRefund: false,
    ambiguous: true,
  });
}

export async function createProviderRefill(orderId: string): Promise<string> {
  const payload = await providerRequest({
    operation: "refill",
    action: "refill",
    timeoutMs: TIMEOUTS.refill,
    params: { order: orderId },
  });

  const readRefill = (value: unknown): string | null => {
    if (!value || typeof value !== "object") return null;

    if (
      "refill" in value &&
      (typeof value.refill === "string" || typeof value.refill === "number")
    ) {
      return String(value.refill);
    }

    if (
      "status" in value &&
      typeof value.status === "string" &&
      value.status.trim().toLowerCase() === "success"
    ) {
      return `refill-${orderId}-${Date.now()}`;
    }

    return null;
  };

  const direct = readRefill(payload);

  if (direct) return direct;

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = readRefill(entry);
      if (nested) return nested;
    }
  }

  throw new ProviderError({
    code: "REFILL_UNAVAILABLE",
    rawMessage: "Malformed refill response: no refill id or success status.",
    operation: "refill",
  });
}

function isCancelSuccessPayload(payload: unknown): boolean {
  const isSuccess = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;

    if ("error" in value) return false;

    if (
      "cancel" in value &&
      (value.cancel === true ||
        typeof value.cancel === "string" ||
        typeof value.cancel === "number")
    ) {
      return true;
    }

    if (
      "status" in value &&
      typeof value.status === "string" &&
      ["success", "cancelled", "canceled"].includes(
        value.status.trim().toLowerCase()
      )
    ) {
      return true;
    }

    return false;
  };

  if (isSuccess(payload)) return true;

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (isSuccess(entry)) return true;

      if (entry && typeof entry === "object") {
        for (const value of Object.values(entry)) {
          if (isSuccess(value)) return true;
        }
      }
    }
  } else if (payload && typeof payload === "object") {
    for (const value of Object.values(payload)) {
      if (isSuccess(value)) return true;
    }
  }

  return false;
}

export async function cancelProviderOrder(orderId: string): Promise<void> {
  // Standard SMM panels use a comma-separated "orders" parameter for
  // cancellation. Some panels accept "order" instead; retry with the singular
  // form only when the first response is an order-parameter style rejection.
  let payload: unknown;

  try {
    payload = await providerRequest({
      operation: "cancel",
      action: "cancel",
      timeoutMs: TIMEOUTS.cancel,
      params: { orders: orderId },
    });
  } catch (error) {
    if (
      error instanceof ProviderError &&
      (error.code === "INVALID_ORDER" || error.code === "UNKNOWN") &&
      /incorrect order|order.*not|missing.*order/i.test(error.rawMessage)
    ) {
      payload = await providerRequest({
        operation: "cancel",
        action: "cancel",
        timeoutMs: TIMEOUTS.cancel,
        params: { order: orderId },
      });
    } else {
      throw error;
    }
  }

  if (isCancelSuccessPayload(payload)) return;

  throw new ProviderError({
    code: "CANCEL_UNAVAILABLE",
    rawMessage: "Malformed cancel response: no success status.",
    operation: "cancel",
  });
}

function mapStatusEntry(
  id: string,
  payload: unknown
): { status?: ProviderOrderStatus; error?: string } {
  if (payload === null || payload === undefined) {
    return { error: "Empty status response." };
  }

  if (typeof payload === "string") {
    return { status: { orderId: id, status: payload } };
  }

  if (typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "Malformed status entry." };
  }

  if ("error" in payload && typeof payload.error === "string") {
    return { error: payload.error };
  }

  const statusValue =
    "status" in payload && typeof payload.status === "string"
      ? payload.status
      : null;

  if (!statusValue) {
    return { error: "Status entry has no status." };
  }

  return {
    status: {
      orderId: id,
      status: statusValue,
      charge:
        "charge" in payload
          ? parseProviderNumber(payload.charge as string | number | undefined)
          : undefined,
      startCount:
        "start_count" in payload
          ? Math.trunc(
              parseProviderNumber(payload.start_count as string | number | undefined)
            )
          : undefined,
      remains:
        "remains" in payload
          ? Math.trunc(
              parseProviderNumber(payload.remains as string | number | undefined)
            )
          : undefined,
    },
  };
}

function parseStatusPayload(payload: unknown): ProviderStatusBatchResult {
  const statuses: Record<string, ProviderOrderStatus> = {};
  const errors: Record<string, string> = {};

  const addEntry = (id: string, value: unknown) => {
    const result = mapStatusEntry(id, value);

    if (result.status) statuses[id] = result.status;
    else errors[id] = result.error ?? "Unknown status error.";
  };

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== "object") continue;

      const idValue =
        "order" in entry
          ? entry.order
          : "orderId" in entry
            ? entry.orderId
            : "id" in entry
              ? entry.id
              : null;

      if (idValue === null || idValue === undefined) continue;

      addEntry(String(idValue), entry);
    }

    return { statuses, errors };
  }

  if (!payload || typeof payload !== "object") {
    throw new ProviderError({
      code: "UPSTREAM",
      rawMessage: "Invalid status response: expected an object or array.",
      operation: "status",
    });
  }

  if (
    "data" in payload &&
    payload.data !== null &&
    typeof payload.data === "object"
  ) {
    if (Array.isArray(payload.data)) {
      return parseStatusPayload(payload.data);
    }

    for (const [id, value] of Object.entries(payload.data as object)) {
      addEntry(id, value);
    }

    return { statuses, errors };
  }

  for (const [id, value] of Object.entries(payload)) {
    addEntry(id, value);
  }

  return { statuses, errors };
}

async function requestStatusBatch(
  orderIds: string[]
): Promise<ProviderStatusBatchResult> {
  const payload = await providerRequest({
    operation: "status",
    action: "status",
    timeoutMs: TIMEOUTS.status,
    params: { orders: orderIds.join(",") },
  });

  return parseStatusPayload(payload);
}

/**
 * Fetches statuses in one batch. The live panel collapses a batch containing
 * any invalid ID into a single top-level error, so an invalid-order error is
 * isolated by recursively splitting the batch. Transport failures propagate to
 * the caller, which isolates them per chunk.
 */
async function requestStatusesWithSplit(
  orderIds: string[]
): Promise<ProviderStatusBatchResult> {
  const uniqueIds = Array.from(new Set(orderIds.filter(Boolean)));

  if (uniqueIds.length === 0) return { statuses: {}, errors: {} };

  try {
    return await requestStatusBatch(uniqueIds);
  } catch (error) {
    const shouldSplit =
      error instanceof ProviderError &&
      uniqueIds.length > 1 &&
      (error.code === "INVALID_ORDER" ||
        (error.code === "UNKNOWN" &&
          /too many|limit|maximum.*order|batch/i.test(error.rawMessage)));

    if (shouldSplit) {
      const middle = Math.ceil(uniqueIds.length / 2);
      const [left, right] = await Promise.all([
        requestStatusesWithSplit(uniqueIds.slice(0, middle)),
        requestStatusesWithSplit(uniqueIds.slice(middle)),
      ]);

      return {
        statuses: { ...left.statuses, ...right.statuses },
        errors: { ...left.errors, ...right.errors },
      };
    }

    if (error instanceof ProviderError && error.code === "INVALID_ORDER") {
      return {
        statuses: {},
        errors: { [uniqueIds[0]]: error.rawMessage },
      };
    }

    throw error;
  }
}

/**
 * The live provider silently omits an invalid id from a mixed batch instead of
 * returning an error for it. Every requested id must therefore be accounted
 * for: missing ids are looked up individually so sync can flag them instead of
 * skipping them forever.
 */
export async function fetchProviderOrderStatuses(
  orderIds: string[]
): Promise<ProviderStatusBatchResult> {
  const uniqueIds = Array.from(new Set(orderIds.filter(Boolean)));

  if (uniqueIds.length === 0) return { statuses: {}, errors: {} };

  const result = await requestStatusesWithSplit(uniqueIds);

  const missingIds = uniqueIds.filter(
    (id) => !result.statuses[id] && !result.errors[id]
  );

  if (missingIds.length === 0) return result;

  const resolutions = await Promise.all(
    missingIds.map(async (id) => {
      try {
        const single = await requestStatusBatch([id]);

        if (single.statuses[id]) {
          return { id, status: single.statuses[id] };
        }

        return {
          id,
          error:
            single.errors[id] ??
            "The provider returned no status for this order.",
        };
      } catch (error) {
        return {
          id,
          error:
            error instanceof ProviderError
              ? error.rawMessage
              : "The provider returned no status for this order.",
        };
      }
    })
  );

  for (const resolution of resolutions) {
    if ("status" in resolution && resolution.status) {
      result.statuses[resolution.id] = resolution.status;
    } else {
      result.errors[resolution.id] =
        resolution.error ?? "The provider returned no status for this order.";
    }
  }

  return result;
}

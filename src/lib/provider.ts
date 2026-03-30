export interface ProviderService {
  service?: string | number;
  name?: string;
  category?: string;
  rate?: string | number;
  min?: string | number;
  max?: string | number;
  type?: string;
  refill?: boolean;
  cancel?: boolean;
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

function parseJsonSafely(text: string): unknown {
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeProviderErrorMessage(message: string): string {
  const normalizedMessage = message.trim();

  if (/out of balance|insufficient balance/i.test(normalizedMessage)) {
    return "Your SMM provider account balance is insufficient. Recharge your provider account, then try placing the order again.";
  }

  return normalizedMessage;
}

function getProviderConfig() {
  const providerUrl = process.env.SMM_PROVIDER_API_URL;
  const providerApiKey = process.env.SMM_PROVIDER_API_KEY;

  if (!providerUrl || !providerApiKey) {
    throw new Error("Services provider is not configured.");
  }

  return { providerUrl, providerApiKey };
}

export function parseProviderNumber(
  value: string | number | undefined,
  fallback = 0
): number {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getProfitMargin(): number {
  const parsed = Number.parseFloat(process.env.SMM_PROFIT_MARGIN ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2.0;
}

export function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

export function calculateSellingRate(providerRate: number): number {
  return roundCurrency(providerRate * getProfitMargin());
}

export function calculateTotalCost(
  sellingRatePerThousand: number,
  quantity: number
): number {
  return roundCurrency((sellingRatePerThousand / 1000) * quantity);
}

export function mapProviderServiceToPublic(
  service: ProviderService
): PublicService | null {
  if (!service.service || !service.name || !service.category) {
    return null;
  }

  const providerRate = parseProviderNumber(service.rate);

  return {
    id: String(service.service),
    name: service.name,
    category: service.category,
    price: calculateSellingRate(providerRate).toFixed(2),
    min: Math.max(0, Math.trunc(parseProviderNumber(service.min))),
    max: Math.max(0, Math.trunc(parseProviderNumber(service.max))),
    type: service.type ?? "default",
    refill: Boolean(service.refill),
    cancel: Boolean(service.cancel),
  };
}

export async function fetchProviderServices(): Promise<ProviderService[]> {
  const { providerUrl, providerApiKey } = getProviderConfig();

  const url = new URL(providerUrl);
  url.searchParams.set("action", "services");
  url.searchParams.set("key", providerApiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = parseJsonSafely(await response.text());

  if (!response.ok) {
    throw new Error("Failed to load services from provider.");
  }

  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    throw new Error(normalizeProviderErrorMessage(payload.error));
  }

  if (!Array.isArray(payload)) {
    throw new Error("Invalid services response from provider.");
  }

  return payload as ProviderService[];
}

export async function fetchProviderBalance(): Promise<ProviderBalance> {
  const { providerUrl, providerApiKey } = getProviderConfig();

  const url = new URL(providerUrl);
  url.searchParams.set("action", "balance");
  url.searchParams.set("key", providerApiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = parseJsonSafely(await response.text());

  if (!response.ok) {
    throw new Error("Failed to load provider balance.");
  }

  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    throw new Error(normalizeProviderErrorMessage(payload.error));
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("balance" in payload)
  ) {
    throw new Error("Invalid balance response from provider.");
  }

  const currency =
    "currency" in payload && typeof payload.currency === "string"
      ? payload.currency
      : undefined;

  return {
    balance: parseProviderNumber(
      payload.balance as string | number | undefined
    ),
    currency,
  };
}

export async function createProviderOrder(input: {
  serviceId: string;
  link: string;
  quantity: number;
}): Promise<string> {
  const { providerUrl, providerApiKey } = getProviderConfig();

  const body = new URLSearchParams({
    key: providerApiKey,
    action: "add",
    service: input.serviceId,
    link: input.link,
    quantity: String(input.quantity),
  });

  const response = await fetch(providerUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = parseJsonSafely(await response.text());

  if (!response.ok) {
    throw new Error("Provider request failed.");
  }

  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    throw new Error(normalizeProviderErrorMessage(payload.error));
  }

  if (
    payload &&
    typeof payload === "object" &&
    "order" in payload &&
    (typeof payload.order === "string" || typeof payload.order === "number")
  ) {
    return String(payload.order);
  }

  throw new Error("Provider returned an invalid order response.");
}

export async function createProviderRefill(orderId: string): Promise<string> {
  const { providerUrl, providerApiKey } = getProviderConfig();

  const body = new URLSearchParams({
    key: providerApiKey,
    action: "refill",
    order: orderId,
  });

  const response = await fetch(providerUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = parseJsonSafely(await response.text());

  if (!response.ok) {
    throw new Error("Provider refill request failed.");
  }

  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    throw new Error(normalizeProviderErrorMessage(payload.error));
  }

  // Some providers return { "refill": <id> }
  if (
    payload &&
    typeof payload === "object" &&
    "refill" in payload &&
    (typeof payload.refill === "string" || typeof payload.refill === "number")
  ) {
    return String(payload.refill);
  }

  // smmbin.com returns { "status": "Success", "message": "..." }
  if (
    payload &&
    typeof payload === "object" &&
    "status" in payload &&
    typeof payload.status === "string" &&
    payload.status.toLowerCase() === "success"
  ) {
    return `refill-${orderId}-${Date.now()}`;
  }

  throw new Error("Provider returned an invalid refill response.");
}

function mapStatusPayload(
  orderId: string,
  payload: unknown
): ProviderOrderStatus | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const status =
    "status" in payload && typeof payload.status === "string"
      ? payload.status
      : null;

  if (!status) {
    return null;
  }

  return {
    orderId,
    status,
    charge:
      "charge" in payload
        ? parseProviderNumber(payload.charge as string | number | undefined)
        : undefined,
    startCount:
      "start_count" in payload
        ? Math.trunc(
            parseProviderNumber(
              payload.start_count as string | number | undefined
            )
          )
        : undefined,
    remains:
      "remains" in payload
        ? Math.trunc(
            parseProviderNumber(payload.remains as string | number | undefined)
          )
        : undefined,
  };
}

export async function fetchProviderOrderStatuses(
  orderIds: string[]
): Promise<Record<string, ProviderOrderStatus>> {
  if (orderIds.length === 0) {
    return {};
  }

  const { providerUrl, providerApiKey } = getProviderConfig();
  const url = new URL(providerUrl);
  url.searchParams.set("action", "status");
  url.searchParams.set("key", providerApiKey);
  url.searchParams.set("orders", orderIds.join(","));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = parseJsonSafely(await response.text());

  if (!response.ok) {
    throw new Error("Failed to load order statuses from provider.");
  }

  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    throw new Error(payload.error);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid order status response from provider.");
  }

  const entries = Object.entries(payload);
  const statuses = entries
    .map(([orderId, value]) => mapStatusPayload(orderId, value))
    .filter((item): item is ProviderOrderStatus => item !== null);

  return Object.fromEntries(statuses.map((item) => [item.orderId, item]));
}

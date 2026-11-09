import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface AiProvider {
  id: string;
  baseUrl: URL;
  apiKey: string;
  headers: Record<string, string>;
  models: string[];
}

export interface AiConfig {
  providers: AiProvider[];
  maxTokens: number;
  sessionId: string;
}

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

  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);

  return false;
}

/**
 * Only public http/https AI endpoints are allowed. This blocks localhost,
 * loopback, private, link-local, metadata, and reserved targets, including
 * hostnames that resolve to them.
 */
export async function validateAiBaseUrl(raw: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("The AI base URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The AI base URL must use http or https.");
  }

  if (url.username || url.password) {
    throw new Error("The AI base URL must not contain credentials.");
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
    throw new Error("The AI host is not allowed.");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });

  if (
    addresses.length === 0 ||
    addresses.some((item) => isPrivateAddress(item.address))
  ) {
    throw new Error("The AI host resolves to a private or reserved address.");
  }

  return url;
}

let configPromise: Promise<AiConfig | null> | null = null;

function listEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAiConfig(): Promise<AiConfig | null> {
  if (!configPromise) {
    configPromise = (async () => {
      const parsedMaxTokens = Number.parseInt(
        process.env.AI_MAX_TOKENS ?? "2048",
        10
      );
      const candidates: Array<{
        id: string;
        rawBaseUrl: string;
        apiKey: string;
        headers: Record<string, string>;
        models: string[];
      }> = [];

      const primaryBaseUrl = process.env.AI_BASE_URL?.trim();
      const primaryApiKey = process.env.AI_API_KEY?.trim();
      const primaryModel = process.env.AI_MODEL?.trim();

      if (primaryBaseUrl && primaryApiKey && primaryModel) {
        candidates.push({
          id: "openrouter-free",
          rawBaseUrl: primaryBaseUrl,
          apiKey: primaryApiKey,
          headers: {},
          models: Array.from(
            new Set([
              primaryModel,
              ...listEnv(process.env.AI_FALLBACK_MODELS),
            ])
          ),
        });
      }

      const goApiKey = process.env.OPENCODE_GO_API_KEY?.trim();

      if (goApiKey) {
        const requestedGoModels = listEnv(process.env.OPENCODE_GO_MODELS);
        const goModels =
          requestedGoModels.length > 0
            ? requestedGoModels
            : [
                process.env.OPENCODE_GO_MODEL?.trim() ||
                  "deepseek-v4.1-flash",
                ...listEnv(process.env.OPENCODE_GO_FALLBACK_MODELS),
              ];

        candidates.push({
          id: "opencode-go",
          rawBaseUrl:
            process.env.OPENCODE_GO_BASE_URL?.trim() ||
            "https://opencode.ai/zen/go/v1",
          apiKey: goApiKey,
          headers: {
            ...(process.env.OPENCODE_GO_ORG_ID?.trim()
              ? {
                  "x-opencode-org-id":
                    process.env.OPENCODE_GO_ORG_ID.trim(),
                }
              : {}),
            ...(process.env.OPENCODE_GO_SESSION?.trim()
              ? {
                  "x-opencode-session":
                    process.env.OPENCODE_GO_SESSION.trim(),
                }
              : {}),
          },
          models: Array.from(new Set(goModels)),
        });
      }

      const altApiKey = process.env.AI_ALT_API_KEY?.trim();

      if (altApiKey) {
        candidates.push({
          id: "openrouter-alt",
          rawBaseUrl:
            process.env.AI_ALT_BASE_URL?.trim() ||
            primaryBaseUrl ||
            "https://openrouter.ai/api/v1",
          apiKey: altApiKey,
          headers: {},
          models: Array.from(
            new Set([
              process.env.AI_ALT_MODEL?.trim() || "z-ai/glm-5.3-flash",
              ...listEnv(process.env.AI_ALT_FALLBACK_MODELS),
            ])
          ),
        });
      }

      const providers: AiProvider[] = [];

      for (const candidate of candidates) {
        try {
          const baseUrl = await validateAiBaseUrl(candidate.rawBaseUrl);
          providers.push({
            id: candidate.id,
            baseUrl,
            apiKey: candidate.apiKey,
            headers: candidate.headers,
            models: candidate.models,
          });
        } catch (error) {
          console.warn("AI provider skipped", {
            provider: candidate.id,
            message:
              error instanceof Error
                ? error.message
                : "Invalid provider configuration.",
          });
        }
      }

      if (providers.length === 0) return null;

      return {
        providers,
        maxTokens:
          Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0
            ? Math.min(parsedMaxTokens, 4096)
            : 2048,
        sessionId: process.env.AI_SESSION_ID?.trim() || "boosthub-agent",
      };
    })().catch((error) => {
      configPromise = null;
      throw error;
    });
  }

  return configPromise;
}

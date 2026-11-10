import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

/**
 * Short-lived order context for one assistant conversation.
 *
 * Without this, a follow-up like "أكد" or a pasted link arrives with no memory
 * of the service and budget chosen one message earlier. The session is scoped
 * to one authenticated customer and one browser conversation.
 */
export interface AgentOrderSession {
  uid: string;
  conversationId: string;
  platform: string | null;
  target: string | null;
  serviceId: string | null;
  link: string | null;
  quantity: number | null;
  budget: number | null;
  comments: string | null;
  dripFeed: { runs: number; interval: number } | null;
  lastDraftId: string | null;
  lastCharge: number | null;
  candidates: string[];
  candidateIndex: number;
  updatedAt: number;
}

const SESSION_COLLECTION = "agent_sessions";
const SESSION_TTL_MS = 45 * 60 * 1000;
const CACHE_LIMIT = 500;
const cache = new Map<string, AgentOrderSession>();

function sessionDocId(uid: string, conversationId: string): string {
  return createHash("sha256")
    .update(`${uid}:${conversationId}`)
    .digest("hex")
    .slice(0, 40);
}

function cacheKey(uid: string, conversationId: string): string {
  return `${uid}:${conversationId}`;
}

function remember(session: AgentOrderSession) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(cacheKey(session.uid, session.conversationId), session);
}

export function createEmptySession(
  uid: string,
  conversationId: string
): AgentOrderSession {
  return {
    uid,
    conversationId,
    platform: null,
    target: null,
    serviceId: null,
    link: null,
    quantity: null,
    budget: null,
    comments: null,
    dripFeed: null,
    lastDraftId: null,
    lastCharge: null,
    candidates: [],
    candidateIndex: 0,
    updatedAt: Date.now(),
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asDripFeed(
  value: unknown
): { runs: number; interval: number } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const runs = Math.trunc(Number(record.runs));
  const interval = Math.trunc(Number(record.interval));

  if (
    !Number.isInteger(runs) ||
    !Number.isInteger(interval) ||
    runs < 2 ||
    interval < 1
  ) {
    return null;
  }

  return { runs, interval };
}

function fromRecord(
  uid: string,
  conversationId: string,
  value: Record<string, unknown>
): AgentOrderSession {
  const candidates = Array.isArray(value.candidates)
    ? value.candidates
        .map((item) => String(item ?? "").trim())
        .filter((item) => /^\d{1,20}$/.test(item))
        .slice(0, 12)
    : [];
  const candidateIndex = Number.isInteger(Number(value.candidateIndex))
    ? Math.max(0, Math.trunc(Number(value.candidateIndex)))
    : 0;

  return {
    uid,
    conversationId,
    platform: asString(value.platform),
    target: asString(value.target),
    serviceId: asString(value.serviceId),
    link: asString(value.link),
    quantity: asNumber(value.quantity),
    budget: asNumber(value.budget),
    comments: asString(value.comments),
    dripFeed: asDripFeed(value.dripFeed),
    lastDraftId: asString(value.lastDraftId),
    lastCharge: asNumber(value.lastCharge),
    candidates,
    candidateIndex,
    updatedAt: Number(value.updatedAt ?? 0) || Date.now(),
  };
}

export async function getAgentSession(
  uid: string,
  conversationId: string
): Promise<AgentOrderSession> {
  const key = cacheKey(uid, conversationId);
  const cached = cache.get(key);

  if (cached && Date.now() - cached.updatedAt <= SESSION_TTL_MS) {
    return cached;
  }

  if (cached) cache.delete(key);

  try {
    const snap = await getAdminDb()
      .collection(SESSION_COLLECTION)
      .doc(sessionDocId(uid, conversationId))
      .get();

    if (!snap.exists) return createEmptySession(uid, conversationId);

    const updatedAt = snap.get("updatedAt")?.toMillis?.() ?? 0;

    if (!updatedAt || Date.now() - updatedAt > SESSION_TTL_MS) {
      await snap.ref.delete().catch(() => undefined);
      return createEmptySession(uid, conversationId);
    }

    const session = fromRecord(uid, conversationId, snap.data() ?? {});
    remember(session);
    return session;
  } catch (error) {
    console.error("Failed to read agent session:", error);
    return createEmptySession(uid, conversationId);
  }
}

export async function saveAgentSession(
  session: AgentOrderSession
): Promise<AgentOrderSession> {
  const next: AgentOrderSession = {
    ...session,
    updatedAt: Date.now(),
    candidates: session.candidates.slice(0, 12),
    candidateIndex: Math.max(0, Math.trunc(session.candidateIndex)),
  };

  remember(next);

  try {
    await getAdminDb()
      .collection(SESSION_COLLECTION)
      .doc(sessionDocId(next.uid, next.conversationId))
      .set(
        {
          uid: next.uid,
          conversationId: next.conversationId,
          platform: next.platform,
          target: next.target,
          serviceId: next.serviceId,
          link: next.link,
          quantity: next.quantity,
          budget: next.budget,
          comments: next.comments,
          dripFeed: next.dripFeed,
          lastDraftId: next.lastDraftId,
          lastCharge: next.lastCharge,
          candidates: next.candidates,
          candidateIndex: next.candidateIndex,
          updatedAt: Timestamp.fromMillis(next.updatedAt),
          expiresAt: Timestamp.fromMillis(next.updatedAt + SESSION_TTL_MS),
        },
        { merge: true }
      );
  } catch (error) {
    // The in-process copy still keeps the same instance conversational.
    console.error("Failed to save agent session:", error);
  }

  return next;
}

export async function clearAgentSession(
  uid: string,
  conversationId: string
): Promise<void> {
  cache.delete(cacheKey(uid, conversationId));

  try {
    await getAdminDb()
      .collection(SESSION_COLLECTION)
      .doc(sessionDocId(uid, conversationId))
      .delete();
  } catch (error) {
    console.error("Failed to clear agent session:", error);
  }
}

export function agentSessionForPrompt(
  session: AgentOrderSession
): Record<string, unknown> {
  return {
    platform: session.platform,
    target: session.target,
    serviceId: session.serviceId,
    link: session.link,
    quantity: session.quantity,
    budget: session.budget,
    lastDraftId: session.lastDraftId,
  };
}

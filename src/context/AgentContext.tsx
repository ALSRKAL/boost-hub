"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { AgentDrawer } from "@/components/agent/AgentDrawer";
import type { AgentAction } from "@/lib/agent-tools";

export interface AgentFormPatch {
  platform?: string | null;
  category?: string | null;
  serviceId?: string | null;
  link?: string | null;
  quantity?: number | null;
  comments?: string | null;
  dripFeed?: boolean;
  runs?: number | null;
  interval?: number | null;
}

export interface AgentPageContext {
  serviceId?: string;
  serviceName?: string;
  link?: string;
  quantity?: number;
  platform?: string;
  section?: string;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AgentAction[];
}

interface AgentContextValue {
  open: boolean;
  openAgent: () => void;
  closeAgent: () => void;
  messages: AgentMessage[];
  isSending: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  prepareService: (serviceId: string) => Promise<void>;
  confirmDraft: (clientRequestId: string) => Promise<void>;
  requestOrderAction: (
    orderId: string,
    action: "refill" | "cancel"
  ) => Promise<void>;
  confirmedDrafts: Set<string>;
  pendingPatch: AgentFormPatch | null;
  applyFormPatch: (patch: AgentFormPatch) => void;
  consumeFormPatch: () => void;
  formContext: AgentPageContext;
  setFormContext: (context: AgentPageContext) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function text(value: unknown, max = 300): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined;
}

function normalizePatch(value: unknown): AgentFormPatch {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;

  return {
    platform: text(record.platform, 40) ?? null,
    category: text(record.category, 160) ?? null,
    serviceId: text(record.serviceId, 40) ?? null,
    link: text(record.link, 500) ?? null,
    quantity: numberValue(record.quantity) ?? null,
    comments: typeof record.comments === "string" ? record.comments : null,
    dripFeed: record.dripFeed === true,
    runs: numberValue(record.runs) ?? null,
    interval: numberValue(record.interval) ?? null,
  };
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedDrafts, setConfirmedDrafts] = useState<Set<string>>(
    () => new Set()
  );
  const [pendingPatch, setPendingPatch] = useState<AgentFormPatch | null>(null);
  const [formContext, setFormContextState] = useState<AgentPageContext>({});
  const [conversationId] = useState(() => uid());

  const openAgent = useCallback(() => setOpen(true), []);
  const closeAgent = useCallback(() => setOpen(false), []);

  const applyFormPatch = useCallback(
    (patch: AgentFormPatch) => {
      setPendingPatch(patch);
      if (pathname !== "/new-order") router.push("/new-order");
    },
    [pathname, router]
  );

  const consumeFormPatch = useCallback(() => setPendingPatch(null), []);

  const setFormContext = useCallback((context: AgentPageContext) => {
    setFormContextState(context);
  }, []);

  const appendReply = useCallback(
    (reply: unknown, actions: unknown) => {
      const safeActions = Array.isArray(actions)
        ? (actions as AgentAction[])
        : [];

      setMessages((current) => [
        ...current,
        {
          id: uid(),
          role: "assistant",
          content:
            typeof reply === "string" && reply.trim()
              ? reply.trim()
              : language === "ar"
                ? "تم."
                : "Done.",
          actions: safeActions,
        },
      ]);

      for (const action of safeActions) {
        if (action.type === "prefill_order") {
          const patch = normalizePatch(action.payload?.formPatch);
          if (patch.serviceId) applyFormPatch(patch);
        }
      }
    },
    [applyFormPatch, language]
  );

  const sendMessage = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (!content || isSending || !user) return;

      const userMessage: AgentMessage = {
        id: uid(),
        role: "user",
        content,
      };
      const history = [...messages, userMessage]
        .filter((message) => message.content.trim())
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.content }));

      setMessages((current) => [...current, userMessage]);
      setIsSending(true);
      setError(null);

      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: history,
            language,
            page: pathname,
            pageContext: formContext,
            conversationId,
            requestNonce: uid(),
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          reply?: unknown;
          actions?: unknown;
          error?: unknown;
        };

        if (!response.ok) {
          throw new Error(
            typeof payload.error === "string"
              ? payload.error
              : language === "ar"
                ? "تعذر الوصول إلى المساعد. أعد المحاولة."
                : "The assistant is unavailable. Please retry."
          );
        }

        appendReply(payload.reply, payload.actions);
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : language === "ar"
              ? "تعذر إكمال الطلب."
              : "The request could not be completed.";
        setError(message);
        setMessages((current) => [
          ...current,
          { id: uid(), role: "assistant", content: message },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [
      appendReply,
      conversationId,
      formContext,
      isSending,
      language,
      messages,
      pathname,
      user,
    ]
  );

  const postAction = useCallback(
    async (action: Record<string, unknown>, successText: string) => {
      if (!user || isSending) return;

      setIsSending(true);
      setError(null);

      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
            language,
            page: pathname,
            pageContext: formContext,
            conversationId,
            requestNonce: uid(),
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          reply?: unknown;
          actions?: unknown;
          error?: unknown;
        };

        if (!response.ok) {
          throw new Error(
            typeof payload.error === "string" ? payload.error : successText
          );
        }

        appendReply(payload.reply, payload.actions);
      } catch (actionError) {
        const message =
          actionError instanceof Error ? actionError.message : successText;
        setError(message);
        setMessages((current) => [
          ...current,
          { id: uid(), role: "assistant", content: message },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [
      appendReply,
      conversationId,
      formContext,
      isSending,
      language,
      pathname,
      user,
    ]
  );

  const confirmDraft = useCallback(
    async (clientRequestId: string) => {
      if (!clientRequestId || confirmedDrafts.has(clientRequestId)) return;

      setConfirmedDrafts((current) => {
        const next = new Set(current);
        next.add(clientRequestId);
        return next;
      });

      await postAction(
        { type: "confirm_order", clientRequestId },
        language === "ar"
          ? "تعذر تنفيذ الطلب."
          : "The order could not be placed."
      );
    },
    [confirmedDrafts, language, postAction]
  );

  const prepareService = useCallback(
    async (serviceId: string) => {
      if (!formContext.link || !formContext.quantity) {
        await sendMessage(
          language === "ar"
            ? `استخدم الخدمة ${serviceId}. أحتاج رابط الهدف والكمية أولًا.`
            : `Use service ${serviceId}. I need the target link and quantity first.`
        );
        return;
      }

      await postAction(
        {
          type: "prepare_order",
          serviceId,
          link: formContext.link,
          quantity: formContext.quantity,
        },
        language === "ar"
          ? "تعذر تجهيز الطلب."
          : "The order could not be prepared."
      );
    },
    [formContext.link, formContext.quantity, language, postAction, sendMessage]
  );

  const requestOrderAction = useCallback(
    async (orderId: string, action: "refill" | "cancel") => {
      await postAction(
        { type: "order_action", orderId, action },
        language === "ar"
          ? "تعذر تنفيذ الإجراء."
          : "The action could not be completed."
      );
    },
    [language, postAction]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setOpen((current) => !current);
      }

      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<AgentContextValue>(
    () => ({
      open,
      openAgent,
      closeAgent,
      messages,
      isSending,
      error,
      sendMessage,
      prepareService,
      confirmDraft,
      requestOrderAction,
      confirmedDrafts,
      pendingPatch,
      applyFormPatch,
      consumeFormPatch,
      formContext,
      setFormContext,
    }),
    [
      open,
      openAgent,
      closeAgent,
      messages,
      isSending,
      error,
      sendMessage,
      prepareService,
      confirmDraft,
      requestOrderAction,
      confirmedDrafts,
      pendingPatch,
      applyFormPatch,
      consumeFormPatch,
      formContext,
      setFormContext,
    ]
  );

  return (
    <AgentContext.Provider value={value}>
      {children}
      <AgentDrawer />
    </AgentContext.Provider>
  );
}

export function useAgent(): AgentContextValue {
  const context = useContext(AgentContext);

  if (!context) {
    throw new Error("useAgent must be used inside AgentProvider.");
  }

  return context;
}

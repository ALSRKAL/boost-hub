import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { COLLECTIONS } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import {
  AGENT_TOOLS,
  buildAgentSystemPrompt,
  executeAgentTool,
  scrubAgentReply,
  type AgentAction,
  type AgentToolContext,
} from "@/lib/agent-tools";
import { getAiConfig, type AiConfig, type AiProvider } from "@/lib/ai-config";
import {
  runDeterministicAgent,
  shouldUseDeterministicRouter,
} from "@/lib/agent-fallback-router";
import {
  agentSessionForPrompt,
  getAgentSession,
} from "@/lib/agent-session";
import { isLanguage, type Language } from "@/lib/i18n";
import { localize, readApiLanguage } from "@/lib/api-language";
import { localizeServiceName } from "@/lib/service-localization";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

interface AgentRequestBody {
  messages?: unknown;
  page?: unknown;
  pageContext?: unknown;
  language?: unknown;
  conversationId?: unknown;
  requestNonce?: unknown;
  action?: unknown;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{6,80}$/;
const MAX_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 2000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

function allowRequest(uid: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(uid);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(uid, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (bucket.count >= 20) return false;

  bucket.count += 1;
  return true;
}

class ModelError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Model request failed.");
    this.status = status;
  }
}

interface ModelPayload {
  choices: Array<{ message: ChatMessage }>;
}

async function requestModel(
  config: AiConfig,
  provider: AiProvider,
  model: string,
  messages: ChatMessage[],
  toolsEnabled = true
): Promise<{ payload: ModelPayload; model: string }> {
  const endpoint = `${provider.baseUrl.toString().replace(/\/+$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://boosthub.panel",
      "X-Title": "BoostHub Order Assistant",
      "x-opencode-session": config.sessionId,
      ...provider.headers,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(toolsEnabled
        ? { tools: AGENT_TOOLS, tool_choice: "auto" }
        : {}),
      temperature: 0.2,
      max_tokens: config.maxTokens,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    throw new ModelError(response.status);
  }

  const payload = (await response.json()) as ModelPayload;

  if (!Array.isArray(payload?.choices) || !payload.choices[0]?.message) {
    throw new ModelError(response.status);
  }

  return { payload, model };
}

async function callWithFallback(
  config: AiConfig,
  messages: ChatMessage[],
  toolsEnabled = true
): Promise<{ payload: ModelPayload; model: string }> {
  let lastError: unknown = null;

  for (const provider of config.providers) {
    for (const model of provider.models) {
      try {
        return await requestModel(
          config,
          provider,
          model,
          messages,
          toolsEnabled
        );
      } catch (error) {
        lastError = error;
        console.warn("Agent model unavailable, trying next", {
          provider: provider.id,
          model,
          status: error instanceof ModelError ? error.status : 0,
        });
      }
    }
  }

  throw lastError ?? new ModelError(0);
}

function readMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-MAX_MESSAGES)
    .filter(
      (item): item is { role: "user" | "assistant"; content: string } =>
        Boolean(item) &&
        typeof item === "object" &&
        (item as { role?: unknown }).role !== undefined &&
        ["user", "assistant"].includes(
          String((item as { role?: unknown }).role)
        ) &&
        typeof (item as { content?: unknown }).content === "string" &&
        Boolean((item as { content: string }).content.trim())
    )
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, MAX_MESSAGE_LENGTH),
    }));
}

function readPageContext(value: unknown): AgentToolContext["pageContext"] {
  if (!value || typeof value !== "object") return {};

  const record = value as Record<string, unknown>;
  const text = (key: string, max = 120) =>
    typeof record[key] === "string"
      ? (record[key] as string).trim().slice(0, max) || undefined
      : undefined;
  const numberValue =
    typeof record.quantity === "number" && Number.isFinite(record.quantity)
      ? Math.trunc(record.quantity)
      : undefined;

  return {
    serviceId: text("serviceId", 40),
    serviceName: text("serviceName", 160),
    link: text("link", 300),
    quantity: numberValue,
    platform: text("platform", 40),
    section: text("section", 40),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function localizeServiceMentions(
  reply: string,
  actions: AgentAction[]
): string {
  let localized = reply;

  const replaceName = (rawName: string) => {
    if (rawName.length < 4 || !localized.includes(rawName)) return;
    localized = localized.split(rawName).join(localizeServiceName(rawName));
  };

  for (const action of actions) {
    const payload = record(action.payload);

    if (action.type === "services") {
      for (const service of list(payload.services)) {
        replaceName(str(record(service).name));
      }
    }

    if (action.type === "prefill_order") {
      replaceName(str(payload.serviceName));
    }

    if (action.type === "account") {
      for (const order of list(payload.orders)) {
        replaceName(str(record(order).serviceName));
      }
    }
  }

  return localized;
}

function safeReply(
  content: unknown,
  language: Language,
  actions: AgentAction[]
): string {
  const reply =
    typeof content === "string" && content.trim()
      ? scrubAgentReply(content.trim(), language)
      : "";

  if (reply) {
    return language === "ar"
      ? localizeServiceMentions(reply, actions)
      : reply;
  }

  if (actions.some((action) => action.type === "prefill_order")) {
    return language === "ar"
      ? "جهّزت النموذج بالبيانات المطلوبة. راجع الحقول ثم أكد الطلب."
      : "I prepared the form with the requested details. Review the fields and confirm the order.";
  }

  if (actions.some((action) => action.type === "order_placed")) {
    return language === "ar"
      ? "تم تنفيذ الطلب. يمكنك متابعته من صفحة الطلبات."
      : "The order was placed. You can track it from the Orders page.";
  }

  return language === "ar"
    ? "لم أتمكن من إكمال ذلك. جرّب صياغة أوضح أو أعد المحاولة."
    : "I couldn't complete that. Try rephrasing or retry.";
}

async function authenticate(
  request: NextRequest
): Promise<{ uid: string; email: string; balance: number } | null> {
  const token = getBearerToken(request.headers.get("authorization"));
  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const userSnap = await getAdminDb()
      .collection(COLLECTIONS.users)
      .doc(decoded.uid)
      .get();

    if (!userSnap.exists) return null;

    const balance = Number(userSnap.get("balance") ?? 0);
    const email =
      typeof userSnap.get("email") === "string"
        ? (userSnap.get("email") as string)
        : decoded.email ?? "";

    return {
      uid: decoded.uid,
      email,
      balance: Number.isFinite(balance) ? balance : 0,
    };
  } catch (error) {
    console.error("Agent auth failed:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: AgentRequestBody;
  const requestLanguage = readApiLanguage(request);

  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return NextResponse.json(
      { error: localize(requestLanguage, "Invalid request body.", "طلب غير صالح.") },
      { status: 400 }
    );
  }

  const language: Language = isLanguage(body.language)
    ? body.language
    : requestLanguage;

  const auth = await authenticate(request);

  if (!auth) {
    return NextResponse.json(
      { error: localize(language, "Unauthorized.", "يجب تسجيل الدخول للمتابعة.") },
      { status: 401 }
    );
  }

  if (!allowRequest(auth.uid)) {
    return NextResponse.json(
      {
        error: localize(
          language,
          "Too many assistant requests. Wait a minute and retry.",
          "طلبات كثيرة على المساعد. انتظر دقيقة ثم حاول مرة أخرى."
        ),
      },
      { status: 429 }
    );
  }

  const page =
    typeof body.page === "string" && body.page.startsWith("/")
      ? body.page.slice(0, 80)
      : "/dashboard";
  const pageContext = readPageContext(body.pageContext);
  const conversationId =
    typeof body.conversationId === "string" &&
    REQUEST_ID_PATTERN.test(body.conversationId)
      ? body.conversationId
      : randomUUID();
  const requestNonce =
    typeof body.requestNonce === "string" &&
    REQUEST_ID_PATTERN.test(body.requestNonce)
      ? body.requestNonce
      : randomUUID();

  const context: AgentToolContext = {
    uid: auth.uid,
    email: auth.email,
    language,
    balance: auth.balance,
    sessionId: conversationId,
    conversationId: `${conversationId}:${requestNonce}`,
    page,
    pageContext,
  };

  const activeSession = await getAgentSession(auth.uid, conversationId);
  const hasOrderContext = Boolean(
    activeSession.serviceId ||
      activeSession.link ||
      activeSession.lastDraftId ||
      activeSession.budget ||
      activeSession.quantity
  );

  let config: AiConfig | null = null;

  try {
    config = await getAiConfig();
  } catch (error) {
    console.error("Agent configuration invalid:", {
      message:
        error instanceof Error ? error.message : "Unknown configuration error",
    });
  }

  // One-click actions: deterministic server tools, no model call.
  if (body.action && typeof body.action === "object") {
    const action = body.action as Record<string, unknown>;

    if (action.type === "prepare_order") {
      try {
        const result = await executeAgentTool(
          "prepare_order_draft",
          {
            serviceId: action.serviceId,
            link: action.link,
            quantity: action.quantity,
            comments: action.comments,
            dripFeed: action.dripFeed,
          },
          context
        );

        return NextResponse.json({
          reply:
            typeof result.data.message === "string"
              ? scrubAgentReply(result.data.message, language)
              : result.ok
                ? language === "ar"
                  ? "تم تجهيز الطلب."
                  : "The order is prepared."
                : language === "ar"
                  ? "تعذر تجهيز الطلب."
                  : "The order could not be prepared.",
          actions: result.actions ?? [],
          toolTrace: [
            {
              name: "prepare_order_draft",
              ok: result.ok,
              summary: result.summary,
            },
          ],
          model: "direct",
        });
      } catch (error) {
        console.error("Agent direct prepare action failed:", error);
        return NextResponse.json(
          { error: language === "ar" ? "تعذّر تجهيز الطلب. حاول مرة أخرى." : "The order preparation failed. Please retry." },
          { status: 500 }
        );
      }
    }

    if (action.type === "confirm_order") {
      try {
        const result = await executeAgentTool(
          "execute_confirmed_order",
          { clientRequestId: action.clientRequestId },
          context
        );

        const message =
          typeof result.data.message === "string"
            ? scrubAgentReply(result.data.message, language)
            : result.ok
              ? language === "ar"
                ? "تم تنفيذ الطلب."
                : "The order was placed."
              : language === "ar"
                ? "تعذر تنفيذ الطلب."
                : "The order could not be placed.";

        return NextResponse.json({
          reply: message,
          actions: result.actions ?? [],
          toolTrace: [
            {
              name: "execute_confirmed_order",
              ok: result.ok,
              summary: result.summary,
            },
          ],
          model: "direct",
        });
      } catch (error) {
        console.error("Agent direct order action failed:", error);
        return NextResponse.json(
          { error: language === "ar" ? "تعذّر تنفيذ إجراء الطلب. حاول مرة أخرى." : "The order action failed. Please retry." },
          { status: 500 }
        );
      }
    }

    if (action.type === "order_action") {
      try {
        const result = await executeAgentTool(
          "request_order_action",
          {
            orderId: action.orderId,
            action: action.action,
          },
          context
        );

        return NextResponse.json({
          reply:
            typeof result.data.message === "string"
              ? scrubAgentReply(result.data.message, language)
              : result.ok
                ? language === "ar"
                  ? "تم تنفيذ الإجراء."
                  : "The action was completed."
                : language === "ar"
                  ? "تعذر تنفيذ الإجراء."
                  : "The action could not be completed.",
          actions: result.actions ?? [],
          toolTrace: [
            {
              name: "request_order_action",
              ok: result.ok,
              summary: result.summary,
            },
          ],
          model: "direct",
        });
      } catch (error) {
        console.error("Agent direct order action failed:", error);
        return NextResponse.json(
          { error: language === "ar" ? "تعذّر تنفيذ إجراء الطلب. حاول مرة أخرى." : "The order action failed. Please retry." },
          { status: 500 }
        );
      }
    }
  }

  const messages = readMessages(body.messages);

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json(
      { error: language === "ar" ? "رسالة العميل مطلوبة." : "A customer message is required." },
      { status: 400 }
    );
  }

  const deterministicMessages = messages
    .filter(
      (
        message
      ): message is { role: "user" | "assistant"; content: string } =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  const deterministicInput = {
    messages: deterministicMessages,
    language,
    page,
    context,
    session: activeSession,
  };

  if (
    shouldUseDeterministicRouter(deterministicMessages.at(-1)?.content ?? "", {
      hasOrderContext,
    })
  ) {
    const deterministic = await runDeterministicAgent(deterministicInput);

    return NextResponse.json({
      ...deterministic,
      fallback: "deterministic",
    });
  }

  if (!config) {
    const deterministic = await runDeterministicAgent(deterministicInput);

    return NextResponse.json({
      ...deterministic,
      fallback: "deterministic",
    });
  }

  const systemPrompt = buildAgentSystemPrompt({
    language,
    page,
    balance: auth.balance,
    pageContext,
    activeOrder: agentSessionForPrompt(activeSession),
  });

  const conversation: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const actions: AgentAction[] = [];
  const toolTrace: Array<{ name: string; ok: boolean; summary: string }> = [];
  let modelUsed = config.providers[0]?.models[0] ?? "deterministic";

  try {
    for (let step = 0; step < 4; step += 1) {
      const response = await callWithFallback(config, conversation);
      modelUsed = response.model;
      const message = response.payload.choices[0].message as ChatMessage;
      const toolCalls = Array.isArray(message.tool_calls)
        ? (message.tool_calls as Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>)
        : [];

      if (toolCalls.length === 0) {
        return NextResponse.json({
          reply: safeReply(message.content, language, actions),
          actions,
          toolTrace,
          model: modelUsed,
        });
      }

      conversation.push({
        role: "assistant",
        content: typeof message.content === "string" ? message.content : "",
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const name = call.function?.name ?? "unknown";
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(call.function?.arguments ?? "{}") as Record<
            string,
            unknown
          >;
        } catch {
          args = {};
        }

        let result;

        try {
          result = await executeAgentTool(name, args, context);
        } catch (toolError) {
          console.error("Agent tool failed", {
            name,
            message:
              toolError instanceof Error ? toolError.message : "Unknown tool error",
          });
          result = {
            ok: false,
            summary: "Tool execution failed.",
            data: {
              ok: false,
              message:
                language === "ar"
                  ? "تعذر تنفيذ هذه الخطوة. أعد المحاولة."
                  : "That step could not be completed. Please retry.",
            },
            actions: [],
          };
        }

        actions.push(...(result.actions ?? []));
        toolTrace.push({
          name,
          ok: result.ok,
          summary: result.summary.slice(0, 160),
        });

        conversation.push({
          role: "tool",
          tool_call_id: call.id ?? randomUUID(),
          content: JSON.stringify(result.data),
        });
      }
    }

    // Ask for a final answer without tools after the tool budget is exhausted.
    const finalResponse = await callWithFallback(
      config,
      [
        ...conversation,
        {
          role: "system",
          content:
            "Respond to the customer now using the tool results. Do not call any more tools.",
        },
      ],
      false
    );

    return NextResponse.json({
      reply: safeReply(
        finalResponse.payload.choices[0].message?.content,
        language,
        actions
      ),
      actions,
      toolTrace,
      model: finalResponse.model,
    });
  } catch (error) {
    console.error("Agent model request failed:", {
      status: error instanceof ModelError ? error.status : "unknown",
      uid: auth.uid,
    });

    // Never dead-end the customer on provider outages or quota exhaustion.
    const deterministic = await runDeterministicAgent(deterministicInput);

    return NextResponse.json({
      ...deterministic,
      fallback: "deterministic",
      degraded: true,
    });
  }
}

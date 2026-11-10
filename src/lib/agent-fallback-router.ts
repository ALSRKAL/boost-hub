import {
  type AgentAction,
  type AgentToolContext,
  type AgentToolResult,
  executeAgentTool,
  solveQuantityForBudget,
} from "@/lib/agent-tools";
import {
  looksLikeQuestion,
  normalizeAgentText,
  parseOrderSignals,
} from "@/lib/agent-intent";
import {
  clearAgentSession,
  getAgentSession,
  saveAgentSession,
  type AgentOrderSession,
} from "@/lib/agent-session";
import type { Language } from "@/lib/i18n";
import { formatCurrency, formatNumber } from "@/lib/constants";
import { calculateCharge } from "@/lib/money";
import { localizeServiceName, localizePlatformKey } from "@/lib/service-localization";
import { localizeStatusText } from "@/lib/error-messages";
import {
  helpReply,
  matchPlatformHelp,
  pageLabel,
} from "@/lib/platform-help";

export interface DeterministicAgentInput {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  language: Language;
  page: string;
  context: AgentToolContext;
  session?: AgentOrderSession;
}

export interface DeterministicAgentResult {
  reply: string;
  actions: AgentAction[];
  toolTrace: Array<{ name: string; ok: boolean; summary: string }>;
  model: "deterministic";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textField(value: unknown, language: Language): string {
  const recordValue = record(value);
  return str(recordValue[language]) || str(recordValue.en);
}

function ar(language: Language, arabic: string, english: string): string {
  return language === "ar" ? arabic : english;
}

const TARGET_LABELS: Record<string, { ar: string; en: string }> = {
  followers: { ar: "متابعين", en: "followers" },
  likes: { ar: "لايكات", en: "likes" },
  views: { ar: "مشاهدات", en: "views" },
  comments: { ar: "تعليقات", en: "comments" },
  shares: { ar: "مشاركات", en: "shares" },
  saves: { ar: "حفظ", en: "saves" },
  story: { ar: "مشاهدات ستوري", en: "story views" },
  live: { ar: "مشاهدات بث", en: "live views" },
  reels: { ar: "ريلز", en: "reels" },
  post: { ar: "تفاعل على المنشور", en: "post engagement" },
  profile: { ar: "الملف الشخصي", en: "profile" },
};

function targetLabel(target: string | null, language: Language): string {
  if (!target) return ar(language, "الخدمة", "service");
  const labels = TARGET_LABELS[target];
  return labels ? labels[language] : target;
}

function platformLabel(platform: string | null, language: Language): string {
  if (!platform) return ar(language, "المنصة", "platform");
  if (language === "ar") return localizePlatformKey(platform);

  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

const LINK_TARGET_LABELS: Record<string, { ar: string; en: string }> = {
  post: { ar: "المنشور أو الفيديو", en: "post or video" },
  profile: { ar: "الملف الشخصي", en: "profile" },
  story: { ar: "الستوري", en: "story" },
  live: { ar: "البث", en: "live stream" },
  track: { ar: "المقطع", en: "track" },
  website: { ar: "الموقع", en: "website" },
  unknown: { ar: "الهدف", en: "target" },
};

function serviceLinkLabel(
  service: Record<string, unknown>,
  language: Language
): string {
  const target = str(service.target);
  const label = LINK_TARGET_LABELS[target] ?? LINK_TARGET_LABELS.unknown;
  return label[language];
}

function serviceLabel(
  service: Record<string, unknown>,
  language: Language
): string {
  const raw = str(service.name);
  return language === "ar" ? localizeServiceName(raw) : raw;
}

function serviceId(service: Record<string, unknown>): string {
  return str(service.id);
}

/** Infers the customer-facing service type from the service name. Provider
 * guidance target can be generic ("post"), which reads badly in a quote. */
function inferTargetFromService(
  service: Record<string, unknown>
): string | null {
  const name = str(service.name);

  if (/\bfollowers?\b|\bsubscribers?\b|\bmembers?\b/i.test(name)) {
    return "followers";
  }
  if (/\blikes?\b/i.test(name)) return "likes";
  if (/\bcomments?\b/i.test(name)) return "comments";
  if (/\bshares?\b/i.test(name)) return "shares";
  if (/\bsaves?\b/i.test(name)) return "saves";
  if (/\bviews?\b|\bplays?\b/i.test(name)) return "views";
  if (/\breels?\b/i.test(name)) return "reels";
  if (/\bstor(?:y|ies)\b/i.test(name)) return "story";
  if (/\blive\b/i.test(name)) return "live";

  return null;
}

function minOf(service: Record<string, unknown>): number {
  return Math.max(1, Math.trunc(num(service.min)));
}

function maxOf(service: Record<string, unknown>): number {
  return Math.max(minOf(service), Math.trunc(num(service.max)));
}

function rateOf(service: Record<string, unknown>): number {
  return num(service.customerRatePer1000);
}

/** Normalizes Arabic/Gulf chat text for keyword checks. */
function normalized(text: string): string {
  return normalizeAgentText(text).toLowerCase();
}

function extractOrderId(text: string): string | null {
  const match =
    text.match(/(?:order|طلب|#)\s*#?([A-Za-z0-9_-]{6,})/i) ??
    text.match(/#\s*([A-Za-z0-9_-]{6,})/);
  return match ? match[1] : null;
}

function replyForStatus(
  orders: Array<Record<string, unknown>>,
  language: Language
): string {
  if (orders.length === 0) {
    return ar(
      language,
      "لا توجد طلبات في حسابك بعد. يمكنني تجهيز طلب جديد إذا أردت.",
      "You have no orders yet. I can prepare a new order if you want."
    );
  }

  const lines = orders.slice(0, 3).map((order) => {
    const id = str(order.orderId).slice(0, 12);
    const rawStatus = str(order.status);
    const status =
      language === "ar" ? localizeStatusText(rawStatus, language) : rawStatus;
    const rawService = str(order.serviceName);
    const service =
      language === "ar" ? localizeServiceName(rawService) : rawService;
    const charge = num(order.charge);
    return `#${id} · ${service} · ${status} · ${formatCurrency(charge)}`;
  });

  return ar(
    language,
    `هذه حالة أحدث طلباتك:\n${lines.join("\n")}\nيمكنك طلب تعويض أو إلغاء من البطاقات أدناه عند توفر الزر.`,
    `Here is your latest order status:\n${lines.join("\n")}\nUse the refill or cancel buttons on the cards below when eligible.`
  );
}

const PAGE_KEYWORDS: Array<{ path: string; pattern: RegExp }> = [
  {
    path: "/add-funds",
    pattern:
      /إضافة رصيد|اضافة رصيد|المحفظة|محفظتي|شحن الرصيد|شحن رصيدي|add funds|wallet|top.?up|deposit/i,
  },
  {
    path: "/orders",
    pattern: /الطلبات|طلباتي|سجل الطلبات|orders|order history|my orders/i,
  },
  {
    path: "/new-order",
    pattern: /طلب جديد|صفحة الطلب|إنشاء طلب|انشاء طلب|new order/i,
  },
  {
    path: "/services",
    pattern: /الخدمات|الكتالوج|services|catalog/i,
  },
  {
    path: "/dashboard",
    pattern: /الرئيسية|النظرة العامة|لوحة التحكم|اللوحة الرئيسية|dashboard|overview|home/i,
  },
];

function detectNavigation(text: string): {
  path: string;
  explicit: boolean;
} | null {
  const explicit = /افتح|خذني|ودني|انتقل|روح|أظهر|اظهر|open|take me|go to|navigate|show me/i.test(
    text
  );
  const where = /أين|اين|وين|where/i.test(text);

  if (!explicit && !where) return null;

  const match = PAGE_KEYWORDS.find((item) => item.pattern.test(text));

  if (!match) return null;

  return { path: match.path, explicit };
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  context: AgentToolContext,
  trace: DeterministicAgentResult["toolTrace"],
  actions: AgentAction[]
): Promise<AgentToolResult | null> {
  try {
    const result = await executeAgentTool(name, args, context);
    trace.push({ name, ok: result.ok, summary: result.summary });
    actions.push(...(result.actions ?? []));
    return result;
  } catch (error) {
    trace.push({
      name,
      ok: false,
      summary:
        error instanceof Error ? error.message.slice(0, 120) : "Tool failed.",
    });
    return null;
  }
}

interface Quote {
  quantity: number | null;
  requestedQuantity: number | null;
  charge: number;
  minimumCharge: number;
  note:
    | "ok"
    | "quantity-missing"
    | "budget-too-low"
    | "clamped-min"
    | "clamped-max"
    | "budget-adjusted"
    | "over-budget";
}

function quoteService(
  service: Record<string, unknown>,
  state: AgentOrderSession
): Quote {
  const rate = rateOf(service);
  const min = minOf(service);
  const max = maxOf(service);
  const minimumCharge =
    num(service.minimumCharge) ||
    calculateCharge(rate, min, { minimumMinor: 1 });
  const budgetQuantity =
    state.budget !== null
      ? num(service.budgetQuantity) ||
        solveQuantityForBudget(rate, state.budget, min, max)
      : null;
  const requestedQuantity = state.quantity;
  let quantity = state.quantity;

  if (quantity !== null) {
    let note: Quote["note"] = "ok";

    if (quantity < min) {
      quantity = min;
      note = "clamped-min";
    } else if (quantity > max) {
      quantity = max;
      note = "clamped-max";
    }

    let charge = calculateCharge(rate, quantity, { minimumMinor: 1 });

    if (state.budget !== null && charge > state.budget) {
      const fit = budgetQuantity ?? 0;

      if (fit > 0) {
        quantity = fit;
        note = "budget-adjusted";
        charge = calculateCharge(rate, quantity, { minimumMinor: 1 });
      } else {
        note = "over-budget";
      }
    }

    return {
      quantity,
      requestedQuantity,
      charge,
      minimumCharge,
      note,
    };
  }

  if (state.budget !== null) {
    const fit = budgetQuantity ?? 0;

    if (fit <= 0) {
      return {
        quantity: null,
        requestedQuantity,
        charge: 0,
        minimumCharge,
        note: "budget-too-low",
      };
    }

    return {
      quantity: fit,
      requestedQuantity,
      charge: calculateCharge(rate, fit, { minimumMinor: 1 }),
      minimumCharge,
      note: "ok",
    };
  }

  return {
    quantity: null,
    requestedQuantity,
    charge: 0,
    minimumCharge,
    note: "quantity-missing",
  };
}

function quoteAction(
  service: Record<string, unknown>,
  quote: Quote,
  state: AgentOrderSession
): AgentAction {
  const userTarget = state.target ?? str(service.target);
  const targetLabels = TARGET_LABELS[userTarget];

  return {
    type: "order_quote",
    payload: {
      serviceId: serviceId(service),
      serviceName: str(service.name),
      platform: str(service.platform),
      target: userTarget,
      targetLabel: targetLabels
        ? { en: targetLabels.en, ar: targetLabels.ar }
        : record(service.targetLabel),
      quantity: quote.quantity,
      totalCharge: quote.charge,
      rate: rateOf(service),
      min: minOf(service),
      max: maxOf(service),
      budget: state.budget,
      minimumCharge: quote.minimumCharge,
      missing: !state.link
        ? "link"
        : quote.quantity === null
          ? "quantity"
          : null,
    },
  };
}

function linkExample(
  service: Record<string, unknown>,
  language: Language
): string {
  const example = record(service.linkExample);
  return (
    str(example[language]) ||
    str(example.en) ||
    ar(language, "رابط الهدف", "the target link")
  );
}

function quoteReply(
  service: Record<string, unknown>,
  quote: Quote,
  state: AgentOrderSession,
  language: Language
): string {
  const name = serviceLabel(service, language);
  const target = targetLabel(state.target ?? str(service.target), language);
  const platform = platformLabel(
    state.platform ?? str(service.platform),
    language
  );
  const budgetLine =
    state.budget !== null
      ? ar(
          language,
          ` من ميزانية ${formatCurrency(state.budget)}`,
          ` from a ${formatCurrency(state.budget)} budget`
        )
      : "";

  if (quote.note === "quantity-missing") {
    return ar(
      language,
      `اخترت لك: ${name}\n${target} ${platform} بسعر ${formatCurrency(
        rateOf(service)
      )} لكل 1000.\nكم كمية تبي؟ أو قل لي ميزانيتك بالروبية وأنا أحسبها لك.`,
      `I picked: ${name}\n${target} on ${platform} at ${formatCurrency(
        rateOf(service)
      )} per 1,000.\nHow many do you want? Or tell me your budget in rupees and I'll calculate it.`
    );
  }

  if (quote.note === "budget-too-low") {
    return ar(
      language,
      `أرخص كمية لهذه الخدمة هي ${formatNumber(
        minOf(service)
      )} بـ${formatCurrency(quote.minimumCharge)}، وميزانيتك ${formatCurrency(
        state.budget ?? 0
      )} أقل من ذلك.\nتحب تزيد الميزانية أو أرشح لك خدمة ثانية؟`,
      `The smallest quantity for this service is ${formatNumber(
        minOf(service)
      )} for ${formatCurrency(quote.minimumCharge)}, and your budget of ${formatCurrency(
        state.budget ?? 0
      )} is below that.\nDo you want to raise the budget or see another service?`
    );
  }

  const quantity = quote.quantity ?? 0;
  const adjustment =
    quote.note === "budget-adjusted" && quote.requestedQuantity
      ? ar(
          language,
          `\nعدّلت الكمية من ${formatNumber(
            quote.requestedQuantity
          )} إلى ${formatNumber(quantity)} عشان تناسب ميزانيتك.`,
          `\nI adjusted the quantity from ${formatNumber(
            quote.requestedQuantity
          )} to ${formatNumber(quantity)} so it fits your budget.`
        )
      : quote.note === "clamped-min"
        ? ar(
            language,
            `\nالحد الأدنى لهذه الخدمة ${formatNumber(
              minOf(service)
            )}، فضبطت الكمية عليه.`,
            `\nThe minimum for this service is ${formatNumber(
              minOf(service)
            )}, so I set the quantity to that.`
          )
        : quote.note === "clamped-max"
          ? ar(
              language,
              `\nأقصى كمية لهذه الخدمة ${formatNumber(
                maxOf(service)
              )}، فضبطت الكمية عليه.`,
              `\nThe maximum for this service is ${formatNumber(
                maxOf(service)
              )}, so I set the quantity to that.`
            )
          : "";

  const budgetWarning =
    quote.note === "over-budget"
      ? ar(
          language,
          `\nتنبيه: هذه الكمية تكلف ${formatCurrency(
            quote.charge
          )}، أعلى من ميزانيتك ${formatCurrency(state.budget ?? 0)}.`,
          `\nNote: this quantity costs ${formatCurrency(
            quote.charge
          )}, above your ${formatCurrency(state.budget ?? 0)} budget.`
        )
      : "";

  const nextStep = state.link
    ? ""
    : ar(
        language,
        `\nأرسل رابط ${serviceLinkLabel(
          service,
          language
        )} الآن، مثال:\n${linkExample(service, language)}`,
        `\nSend the ${serviceLinkLabel(
          service,
          language
        )} link now, for example:\n${linkExample(service, language)}`
      );

  return ar(
    language,
    `تمام — ${formatNumber(quantity)} ${target} على ${platform}${budgetLine}.\nالإجمالي ${formatCurrency(
      quote.charge
    )} (${formatCurrency(rateOf(service))} لكل 1000).${adjustment}${budgetWarning}${nextStep}`,
    `Done — ${formatNumber(quantity)} ${target} on ${platform}${budgetLine}.\nTotal ${formatCurrency(
      quote.charge
    )} (${formatCurrency(rateOf(service))} per 1,000).${adjustment}${budgetWarning}${nextStep}`
  );
}

function priceReply(
  service: Record<string, unknown>,
  quote: Quote,
  state: AgentOrderSession,
  language: Language
): string {
  const name = serviceLabel(service, language);
  const target = targetLabel(state.target ?? str(service.target), language);
  const sizeLine =
    quote.quantity !== null
      ? ar(
          language,
          `${formatNumber(quote.quantity)} ${target} = ${formatCurrency(
            quote.charge
          )}`,
          `${formatNumber(quote.quantity)} ${target} = ${formatCurrency(
            quote.charge
          )}`
        )
      : ar(
          language,
          `أقل كمية ${formatNumber(minOf(service))} = ${formatCurrency(
            quote.minimumCharge
          )}`,
          `Minimum quantity ${formatNumber(minOf(service))} = ${formatCurrency(
            quote.minimumCharge
          )}`
        );

  return ar(
    language,
    `${name}\nالسعر ${formatCurrency(rateOf(service))} لكل 1000.\n${sizeLine}.\nالدفع من رصيد المحفظة. أرسل رابط ${serviceLinkLabel(
      service,
      language
    )} وأجهز الطلب متى ما تبي.`,
    `${name}\nPrice ${formatCurrency(rateOf(service))} per 1,000.\n${sizeLine}.\nPaid from your wallet. Send the ${serviceLinkLabel(
      service,
      language
    )} link and I'll prepare the order whenever you want.`
  );
}

function depositActions(): AgentAction[] {  const upiId = process.env.NEXT_PUBLIC_UPI_ID ?? "";

  return [
    {
      type: "deposit",
      payload: {
        guide: true,
        upiId,
        qrPath: "/payment-qr.png",
      },
    },
    {
      type: "navigate",
      payload: {
        path: "/add-funds",
        label: pageLabel("/add-funds"),
        auto: false,
      },
    },
  ];
}

export function shouldUseDeterministicRouter(
  text: string,
  options: { hasOrderContext?: boolean } = {}
): boolean {
  const value = normalized(text);
  if (!value.trim()) return false;

  const signals = parseOrderSignals(text);

  if (signals.confirm) return true;
  if (
    /^(?:تمام|طيب|اوكي|اوك|حلو|ماشي|ok|okay)$/.test(value) &&
    options.hasOrderContext === true
  ) {
    return true;
  }
  if (signals.negative) return options.hasOrderContext === true;
  if (signals.wantsAlternative && options.hasOrderContext === true) return true;
  if (signals.explicitServiceId) return true;
  if (signals.budget !== null) return true;
  if (signals.link) return true;
  if (
    (signals.platform || signals.target || signals.orderVerb) &&
    !signals.question
  ) {
    return true;
  }
  if (detectNavigation(value)) return true;
  if (matchPlatformHelp(value)) return true;

  if (
    looksLikeQuestion(value) &&
    !/رصيدي|حالة طلبي|حالة طلباتي|my balance|my orders? status|track my order/i.test(
      value
    )
  ) {
    return false;
  }

  if (
    /balance|wallet|add funds|deposit|upi|utr|رصيد|محفظة|شحن|إيداع|ايداع|ادفع|أدفع|pay/.test(
      value
    )
  ) {
    return true;
  }

  if (
    /status|my orders?|track|refill|cancel|حالة|طلبي|طلباتي|تعويض|إلغاء|الغاء/.test(
      value
    )
  ) {
    return true;
  }

  return false;
}

export async function runDeterministicAgent(
  input: DeterministicAgentInput
): Promise<DeterministicAgentResult> {
  const trace: DeterministicAgentResult["toolTrace"] = [];
  const actions: AgentAction[] = [];
  const language = input.language;
  const context = input.context;
  const userMessages = input.messages.filter(
    (message) => message.role === "user" && message.content.trim()
  );
  const text = userMessages[userMessages.length - 1]?.content ?? "";
  const signals = parseOrderSignals(text);
  const value = normalized(text);
  let session =
    input.session ?? (await getAgentSession(context.uid, context.sessionId));
  const hasSessionData = Boolean(
    session.serviceId ||
      session.link ||
      session.lastDraftId ||
      session.budget ||
      session.quantity
  );
  const softConfirm = /^(?:تمام|طيب|اوكي|اوك|حلو|ماشي|ok|okay)$/.test(value);

  async function persist(next: AgentOrderSession): Promise<AgentOrderSession> {
    session = await saveAgentSession(next);
    return session;
  }

  async function serviceById(
    id: string
  ): Promise<Record<string, unknown> | null> {
    const result = await runTool(
      "select_service",
      { serviceId: id },
      context,
      trace,
      actions
    );

    if (!result?.ok) return null;

    const service = record(record(result.data).service);
    return serviceId(service) ? service : null;
  }

  async function findService(
    state: AgentOrderSession,
    sortBy: "cheapest" | "fastest" | "recommended"
  ): Promise<{
    service: Record<string, unknown> | null;
    services: Array<Record<string, unknown>>;
  }> {
    let result = await runTool(
      "search_catalog_services",
      {
        platform: state.platform ?? undefined,
        target: state.target ?? undefined,
        budget: state.budget ?? undefined,
        quantity: state.quantity ?? undefined,
        requireRefill: signals.wantsRefill,
        sortBy,
        limit: 6,
      },
      context,
      trace,
      actions
    );

    let services = list(record(result?.data).services).map(record);

    if (services.length === 0 && state.quantity !== null) {
      result = await runTool(
        "search_catalog_services",
        {
          platform: state.platform ?? undefined,
          target: state.target ?? undefined,
          budget: state.budget ?? undefined,
          requireRefill: signals.wantsRefill,
          sortBy,
          limit: 6,
        },
        context,
        trace,
        actions
      );
      services = list(record(result?.data).services).map(record);
    }

    return { service: services[0] ?? null, services };
  }

  async function prepareAndReport(
    service: Record<string, unknown>,
    quote: Quote,
    state: AgentOrderSession
  ): Promise<DeterministicAgentResult> {
    const link = state.link;
    const quantity = quote.quantity;

    if (!link) {
      await persist({
        ...state,
        serviceId: serviceId(service),
        lastCharge: quote.charge,
        candidates: state.candidates.length
          ? state.candidates
          : [serviceId(service)],
        candidateIndex: 0,
      });

      return {
        reply: quoteReply(service, quote, state, language),
        actions: [...actions, quoteAction(service, quote, state)],
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (!quantity) {
      await persist({
        ...state,
        serviceId: serviceId(service),
        link,
        lastCharge: quote.charge,
      });

      return {
        reply: quoteReply(service, quote, state, language),
        actions: [...actions, quoteAction(service, quote, state)],
        toolTrace: trace,
        model: "deterministic",
      };
    }

    const validation = await runTool(
      "validate_and_normalize_link",
      { serviceId: serviceId(service), link },
      context,
      trace,
      actions
    );
    const validationData = record(validation?.data);

    if (!validationData.ok) {
      await persist({
        ...state,
        serviceId: serviceId(service),
        link,
        lastCharge: quote.charge,
      });

      return {
        reply:
          textField(validationData.message, language) ||
          ar(
            language,
            "الرابط غير متوافق مع هذه الخدمة.",
            "This link does not match the selected service."
          ),
        actions: [
          ...actions,
          quoteAction(service, quote, { ...state, link: null }),
        ],
        toolTrace: trace,
        model: "deterministic",
      };
    }

    const normalizedLink =
      str(validationData.normalizedLink) || link;
    const prepared = await runTool(
      "prepare_order_draft",
      {
        serviceId: serviceId(service),
        link: normalizedLink,
        quantity,
        comments: state.comments ?? undefined,
        dripFeed: state.dripFeed ?? undefined,
      },
      context,
      trace,
      actions
    );
    const preparedData = record(prepared?.data);

    if (!preparedData.ok) {
      const message =
        typeof preparedData.message === "string"
          ? preparedData.message
          : textField(preparedData.message, language);

      await persist({
        ...state,
        serviceId: serviceId(service),
        link: normalizedLink,
        quantity,
        lastCharge: quote.charge,
      });

      return {
        reply:
          message ||
          ar(language, "تعذر تجهيز الطلب.", "The order could not be prepared."),
        actions: [...actions, quoteAction(service, quote, state)],
        toolTrace: trace,
        model: "deterministic",
      };
    }

    const draft = record(preparedData.orderDraft);
    const totalCharge = num(draft.totalCharge);
    const walletBalance = num(draft.walletBalance);
    const shortfall = Math.max(
      0,
      Math.round((totalCharge - walletBalance) * 100) / 100
    );
    const canPlace = draft.canPlace === true;
    const name = serviceLabel(service, language);
    const target = targetLabel(state.target ?? str(service.target), language);

    await persist({
      ...state,
      serviceId: serviceId(service),
      link: normalizedLink,
      quantity,
      lastDraftId: str(draft.clientRequestId) || state.lastDraftId,
      lastCharge: totalCharge,
    });

    const confirmText = canPlace
      ? ar(
          language,
          "رصيدك يكفي — اضغط «تأكيد وتنفيذ الطلب» أو اكتب «أكد».",
          "Your balance covers it — tap “Confirm & place order” or write “confirm”."
        )
      : ar(
          language,
          `ينقصك ${formatCurrency(
            shortfall
          )}. أضف رصيدًا من البطاقة ثم أكد الطلب.`,
          `You are short ${formatCurrency(
            shortfall
          )}. Add funds from the card, then confirm the order.`
        );

    return {
      reply: ar(
        language,
        `جهّزت طلبك:\n${name}\n${formatNumber(quantity)} ${target} — الإجمالي ${formatCurrency(
          totalCharge
        )}\nرصيدك ${formatCurrency(walletBalance)}\n${confirmText}`,
        `Your order is ready:\n${name}\n${formatNumber(quantity)} ${target} — total ${formatCurrency(
          totalCharge
        )}\nWallet ${formatCurrency(walletBalance)}\n${confirmText}`
      ),
      actions: canPlace
        ? actions
        : [...actions, ...depositActions()],
      toolTrace: trace,
      model: "deterministic",
    };
  }

  try {
    const navigation = detectNavigation(value);
    const priceQuestion =
      /كم\s*(?:سعر|تكلف|ثمن|بكم|يكون|هي|هو)|بكم|how much|price|سعر/i.test(
        value
      );
    const concreteOrder = Boolean(
      signals.explicitServiceId ||
        signals.link ||
        signals.budget !== null ||
        (priceQuestion &&
          (signals.platform || signals.target || signals.explicitServiceId)) ||
        ((signals.platform || signals.target) &&
          (signals.orderVerb || signals.quantity !== null) &&
          !signals.question)
    );

    if (navigation && !signals.wantsAlternative) {
      const label = pageLabel(navigation.path);

      return {
        reply: ar(
          language,
          navigation.explicit
            ? `سأفتح صفحة ${label.ar}.`
            : `صفحة ${label.ar} موجودة في القائمة الجانبية. يمكنك فتحها من الزر أدناه.`,
          navigation.explicit
            ? `Opening ${label.en}.`
            : `${label.en} is available from the sidebar. You can open it with the button below.`
        ),
        actions: [
          {
            type: "navigate",
            payload: {
              path: navigation.path,
              label,
              auto: navigation.explicit,
            },
          },
        ],
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (signals.question && !concreteOrder && !signals.wantsAlternative) {
      const help = matchPlatformHelp(value);

      if (help) {
        const helpActions: AgentAction[] = [];

        if (help.id === "deposits" || help.id === "wallet") {
          helpActions.push(...depositActions().slice(0, 1));
        }

        if (help.page) {
          helpActions.push({
            type: "navigate",
            payload: {
              path: help.page,
              label: pageLabel(help.page),
              auto: false,
            },
          });
        }

        const pendingLine =
          (help.id === "deposits" || help.id === "wallet") &&
          session.lastCharge &&
          session.lastCharge > 0
            ? ar(
                language,
                `\n\nالمطلوب للطلب الحالي: ${formatCurrency(
                  session.lastCharge
                )}. بعد شحن الرصيد أكد الطلب وأنا أنفذه.`,
                `\n\nThe current order needs ${formatCurrency(
                  session.lastCharge
                )}. After topping up, confirm and I'll place it.`
              )
            : "";

        return {
          reply: `${helpReply(help, language)}${pendingLine}`,
          actions: helpActions,
          toolTrace: trace,
          model: "deterministic",
        };
      }
    }

    const personalBalance = /رصيدي|الرصيد الحالي|my balance|wallet balance/i.test(
      value
    );
    const personalStatus =
      /حالة طلبي|حالة طلباتي|my order status|track my order/i.test(value);

    if (signals.confirm || (softConfirm && Boolean(session.lastDraftId))) {
      if (session.lastDraftId) {
        const result = await runTool(
          "execute_confirmed_order",
          { clientRequestId: session.lastDraftId },
          context,
          trace,
          actions
        );
        const data = record(result?.data);

        if (result?.ok) {
          const orderId = str(data.orderId);
          const charge = num(data.charge);
          const balanceAfter = num(data.balanceAfter);
          const name = serviceLabel(
            record(data.service),
            language
          );

          return {
            reply: ar(
              language,
              `تم إنشاء الطلب${orderId ? ` #${orderId.slice(0, 12)}` : ""}.\n${name}\nالمبلغ ${formatCurrency(
                charge
              )}، والمتبقي في رصيدك ${formatCurrency(
                balanceAfter
              )}.\nتابع الحالة من صفحة الطلبات.`,
              `Order created${orderId ? ` #${orderId.slice(0, 12)}` : ""}.\n${name}\nCharged ${formatCurrency(
                charge
              )}, remaining balance ${formatCurrency(
                balanceAfter
              )}.\nTrack it from the Orders page.`
            ),
            actions,
            toolTrace: trace,
            model: "deterministic",
          };
        }

        if (str(data.code) === "DRAFT_EXPIRED") {
          await persist({ ...session, lastDraftId: null });

          return {
            reply: ar(
              language,
              "انتهت صلاحية المسودة قبل التأكيد. أرسل تفاصيل الطلب مرة ثانية وأجهزه لك من جديد.",
              "The prepared draft expired before confirmation. Send the order details again and I'll prepare a new one."
            ),
            actions,
            toolTrace: trace,
            model: "deterministic",
          };
        }

        const message =
          typeof data.message === "string"
            ? data.message
            : textField(data.message, language);

        const insufficient = /insufficient|غير كاف|شحن الرصيد/i.test(message);

        if (insufficient) {
          actions.push(...depositActions());
          const charge = session.lastCharge ?? 0;
          const shortfall = Math.max(
            0,
            Math.round((charge - context.balance) * 100) / 100
          );

          return {
            reply: ar(
              language,
              `رصيدك ${formatCurrency(context.balance)} والطلب يحتاج ${formatCurrency(
                charge
              )}. ينقصك ${formatCurrency(
                shortfall
              )}. أضف رصيدًا من البطاقة ثم اضغط «أكد» مرة ثانية.`,
              `Your balance is ${formatCurrency(
                context.balance
              )} and the order needs ${formatCurrency(
                charge
              )}. You are short ${formatCurrency(
                shortfall
              )}. Add funds from the card, then confirm again.`
            ),
            actions,
            toolTrace: trace,
            model: "deterministic",
          };
        }

        return {
          reply:
            message ||
            ar(
              language,
              "تعذر تنفيذ الطلب. راجع الرصيد والرابط ثم حاول مرة أخرى.",
              "The order could not be placed. Check the balance and link, then retry."
            ),
          actions,
          toolTrace: trace,
          model: "deterministic",
        };
      }

      if (
        session.serviceId &&
        session.link &&
        (session.quantity || session.budget)
      ) {
        const service = await serviceById(session.serviceId);

        if (service) {
          const quote = quoteService(service, session);

          if (quote.quantity) {
            const prepared = await prepareAndReport(service, quote, session);
            const draft = prepared.actions.find(
              (action) => action.type === "prefill_order"
            );
            const draftId = str(record(draft?.payload).clientRequestId);

            // No draft means the quote or link check stopped the flow; return
            // that explanation instead of a misleading "nothing to confirm".
            if (!draftId) return prepared;

            const executed = await runTool(
              "execute_confirmed_order",
              { clientRequestId: draftId },
              context,
              trace,
              actions
            );
            const data = record(executed?.data);

            if (executed?.ok) {
              return {
                reply: ar(
                  language,
                  `تم إنشاء الطلب${
                    str(data.orderId)
                      ? ` #${str(data.orderId).slice(0, 12)}`
                      : ""
                  } بنجاح.\nالمبلغ ${formatCurrency(
                    num(data.charge)
                  )}، والمتبقي ${formatCurrency(
                    num(data.balanceAfter)
                  )}.\nتابع الحالة من صفحة الطلبات.`,
                  `Order created${
                    str(data.orderId)
                      ? ` #${str(data.orderId).slice(0, 12)}`
                      : ""
                  } successfully.\nCharged ${formatCurrency(
                    num(data.charge)
                  )}, remaining ${formatCurrency(
                    num(data.balanceAfter)
                  )}.\nTrack it from the Orders page.`
                ),
                actions,
                toolTrace: trace,
                model: "deterministic",
              };
            }

            const message =
              str(data.message) ||
              ar(
                language,
                "تعذر تنفيذ الطلب. أضف رصيدًا كافيًا ثم أكد.",
                "The order could not be placed. Add enough funds, then confirm."
              );

            if (/insufficient|غير كاف|شحن الرصيد/i.test(message)) {
              actions.push(...depositActions());
            }

            return {
              reply: message,
              actions,
              toolTrace: trace,
              model: "deterministic",
            };
          }
        }
      }

      return {
        reply: ar(
          language,
          "لا يوجد طلب جاهز للتأكيد الآن. اكتب لي المنصة والخدمة والكمية أو الميزانية، وأجهزه لك.",
          "There is no prepared order to confirm. Tell me the platform, service, and quantity or budget, and I'll prepare it."
        ),
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (
      signals.negative &&
      hasSessionData &&
      !signals.platform &&
      !signals.target &&
      signals.budget === null &&
      signals.quantity === null &&
      !signals.link
    ) {
      await clearAgentSession(context.uid, context.sessionId);

      return {
        reply: ar(
          language,
          "تمام، ألغيت المسودة الحالية. تحب نبدأ من جديد، أو تبي خدمة ثانية؟",
          "Okay, I cleared the current draft. Do you want to start over or pick another service?"
        ),
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (
      signals.wantsAlternative &&
      session.candidates.length > 1 &&
      !signals.link
    ) {
      const nextIndex =
        (session.candidateIndex + 1) % session.candidates.length;
      const nextId = session.candidates[nextIndex];
      const service = nextId ? await serviceById(nextId) : null;

      if (service) {
        session = await persist({
          ...session,
          serviceId: serviceId(service),
          platform: str(service.platform) || session.platform,
          target: session.target || str(service.target) || null,
          quantity:
            session.budget !== null && signals.quantity === null
              ? null
              : session.quantity,
          lastDraftId: null,
          candidateIndex: nextIndex,
        });
        const quote = quoteService(service, session);

        return prepareAndReport(service, quote, session);
      }
    }

    const actionIntent = /refill|cancel|تعويض|إلغاء|الغاء/i.test(value);
    const statusIntent =
      /status|my orders?|track|حالة|طلبي|طلباتي/i.test(value);
    const walletIntent =
      /balance|wallet|add funds|deposit|upi|utr|رصيد|محفظة|شحن|إيداع|ايداع|ادفع|أدفع|pay/i.test(
        value
      );

    if (actionIntent && (signals.link === null || !/https?:\/\//i.test(signals.link))) {
      const orderId = extractOrderId(text);

      if (orderId) {
        const action = /cancel|إلغاء|الغاء/i.test(value) ? "cancel" : "refill";
        const result = await runTool(
          "request_order_action",
          { orderId, action },
          context,
          trace,
          actions
        );
        const data = record(result?.data);
        const message = str(data.message);

        return {
          reply:
            message ||
            ar(language, "تم تنفيذ الإجراء.", "The action was completed."),
          actions,
          toolTrace: trace,
          model: "deterministic",
        };
      }
    }

    if (statusIntent || (actionIntent && !extractOrderId(text))) {
      const result = await runTool(
        "get_my_orders",
        { limit: 5 },
        context,
        trace,
        actions
      );
      const orders = list(record(result?.data).orders).map(record);

      return {
        reply: replyForStatus(orders, language),
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (walletIntent && !personalBalance) {
      const result = await runTool(
        "get_my_wallet_and_deposit_guide",
        {},
        context,
        trace,
        actions
      );
      const data = record(result?.data);
      const balance = num(data.balance);
      const steps = list(data.steps);
      const pendingCharge = session.lastCharge ?? 0;
      const pendingLine =
        pendingCharge > balance
          ? ar(
              language,
              `\nالمطلوب للطلب الحالي ${formatCurrency(
                pendingCharge
              )}، وينقصك ${formatCurrency(
                Math.round((pendingCharge - balance) * 100) / 100
              )}. بعد الشحن أكد الطلب وأنا أنفذه.`,
              `\nThe current order needs ${formatCurrency(
                pendingCharge
              )}, and you are short ${formatCurrency(
                Math.round((pendingCharge - balance) * 100) / 100
              )}. After topping up, confirm and I'll place it.`
            )
          : "";

      const lines = steps
        .slice(0, 3)
        .map((step) => `- ${textField(step, language)}`)
        .join("\n");

      return {
        reply: ar(
          language,
          `رصيد محفظتك الحالي ${formatCurrency(balance)}.\nلإضافة رصيد عبر UPI:\n${lines}${pendingLine}`,
          `Your current wallet balance is ${formatCurrency(
            balance
          )}.\nTo add funds via UPI:\n${lines}${pendingLine}`
        ),
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (personalBalance) {
      const result = await runTool(
        "get_my_wallet_and_deposit_guide",
        {},
        context,
        trace,
        actions
      );
      const data = record(result?.data);

      for (let index = actions.length - 1; index >= 0; index -= 1) {
        if (actions[index].type === "deposit" || actions[index].type === "navigate") {
          actions.splice(index, 1);
        }
      }

      return {
        reply: ar(
          language,
          `رصيد محفظتك الحالي ${formatCurrency(num(data.balance))}.`,
          `Your current wallet balance is ${formatCurrency(num(data.balance))}.`
        ),
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (personalStatus) {
      const result = await runTool(
        "get_my_orders",
        { limit: 5 },
        context,
        trace,
        actions
      );
      const orders = list(record(result?.data).orders).map(record);

      return {
        reply: replyForStatus(orders, language),
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    // ---------------------------------------------------------------------
    // Conversational order flow
    // ---------------------------------------------------------------------

    const platformChanged =
      signals.platform !== null && signals.platform !== session.platform;
    const targetChanged =
      signals.target !== null && signals.target !== session.target;
    const budgetIsStale =
      signals.budget === null &&
      (signals.quantity !== null || platformChanged || targetChanged);

    const state: AgentOrderSession = {
      ...session,
      platform: signals.platform ?? session.platform,
      target: signals.target ?? session.target,
      budget: signals.budget ?? (budgetIsStale ? null : session.budget),
      quantity:
        signals.budget !== null && signals.quantity === null
          ? null
          : (signals.quantity ?? session.quantity),
      link: signals.link ?? session.link,
      serviceId: signals.explicitServiceId ?? session.serviceId,
    };

    if (!state.link && context.pageContext.link) {
      state.link = context.pageContext.link;
    }
    if (!state.quantity && !state.budget && context.pageContext.quantity) {
      state.quantity = context.pageContext.quantity;
    }
    if (!state.platform && context.pageContext.platform) {
      state.platform = context.pageContext.platform;
    }

    if (platformChanged || targetChanged || signals.explicitServiceId) {
      state.serviceId = signals.explicitServiceId ?? null;
      state.lastDraftId = null;
      state.candidates = [];
      state.candidateIndex = 0;
    }

    // A link from a previous service type is not reusable. If the customer
    // pasted a new link in this message, keep that one.
    if ((platformChanged || targetChanged) && !signals.link) {
      state.link = null;
    }

    if (signals.budget !== null || signals.quantity !== null) {
      state.lastDraftId = null;
    }

    if (!state.platform && !state.target && !state.serviceId) {
      await persist(state);

      return {
        reply: ar(
          language,
          "أبشر، أساعدك تطلب. اكتب المنصة والخدمة، مثال: «أشتي 500 لايك إنستقرام» أو «متابعين تيك توك بعشرين ربية».",
          "Happy to help you order. Tell me the platform and service, for example: “500 Instagram likes” or “TikTok followers for 20 rupees”."
        ),
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (state.platform && !state.target && !state.serviceId) {
      await persist(state);

      return {
        reply: ar(
          language,
          `على ${platformLabel(
            state.platform,
            language
          )} — تحب متابعين، لايكات، مشاهدات، تعليقات، أو شيء ثاني؟`,
          `On ${platformLabel(
            state.platform,
            language
          )} — do you want followers, likes, views, comments, or something else?`
        ),
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (!state.platform && state.target) {
      await persist(state);

      return {
        reply: ar(
          language,
          `${targetLabel(
            state.target,
            language
          )} على أي منصة؟ إنستقرام، تيك توك، يوتيوب، إكس، أو فيسبوك؟`,
          `${targetLabel(
            state.target,
            language
          )} on which platform? Instagram, TikTok, YouTube, X, or Facebook?`
        ),
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    let service: Record<string, unknown> | null = null;
    let serviceOptions: Array<Record<string, unknown>> = [];
    let explicitServiceMissing = false;

    if (state.serviceId) {
      service = await serviceById(state.serviceId);

      if (!service && signals.explicitServiceId) {
        explicitServiceMissing = true;
        state.serviceId = null;
      }
    }

    if (!service && explicitServiceMissing) {
      await persist(state);

      return {
        reply: ar(
          language,
          `ما لقيت خدمة بالرقم ${signals.explicitServiceId}. تأكد من رقم الخدمة أو اخترها من الكتالوج وأنا أجهز الطلب.`,
          `I couldn't find service ${signals.explicitServiceId}. Check the service ID or choose it from the catalog and I'll prepare the order.`
        ),
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (!service) {
      const sortBy =
        priceQuestion || signals.wantsCheapest
          ? "cheapest"
          : signals.wantsFastest
            ? "fastest"
            : "recommended";
      const found = await findService(state, sortBy);
      service = found.service;
      serviceOptions = found.services;

    }

    if (service) {
      state.serviceId = serviceId(service);
      state.platform = str(service.platform) || state.platform;
      const inferred = inferTargetFromService(service) ?? str(service.target);
      if (signals.explicitServiceId || !state.target) {
        state.target = inferred || state.target;
      }
    }

    // The quote card replaces the raw search list in the conversation.
    for (let index = actions.length - 1; index >= 0; index -= 1) {
      if (actions[index].type === "services") actions.splice(index, 1);
    }

    if (!service) {
      await persist(state);

      return {
        reply: ar(
          language,
          `ما لقيت خدمة ${targetLabel(
            state.target,
            language
          )} على ${platformLabel(state.platform, language)}.${
            state.budget !== null
              ? ` جرّب ميزانية أعلى قليلًا أو خدمة ثانية.`
              : ""
          }`,
          `I couldn't find ${targetLabel(
            state.target,
            language
          )} on ${platformLabel(state.platform, language)}.${
            state.budget !== null
              ? ` Try a slightly higher budget or another service.`
              : ""
          }`
        ),
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    const quote = quoteService(service, state);

    // Remember the affordable alternatives so "غيرها" works naturally.
    if (state.candidates.length === 0) {
      const listed = serviceOptions
        .map((item) => str(item.id))
        .filter(Boolean)
        .slice(0, 8);
      state.candidates = listed.length > 0 ? listed : [serviceId(service)];
      state.candidateIndex = Math.max(
        0,
        state.candidates.indexOf(serviceId(service))
      );
    } else if (!state.candidates.includes(serviceId(service))) {
      state.candidates = [serviceId(service), ...state.candidates].slice(0, 8);
      state.candidateIndex = 0;
    }

    if (priceQuestion) {
      if (quote.quantity !== null) state.quantity = quote.quantity;
      await persist({
        ...state,
        serviceId: serviceId(service),
        lastCharge: quote.charge,
      });

      return {
        reply: priceReply(service, quote, state, language),
        actions: [...actions, quoteAction(service, quote, state)],
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (
      state.budget !== null &&
      quote.note === "budget-too-low"
    ) {
      await persist({
        ...state,
        serviceId: serviceId(service),
        quantity: null,
        lastCharge: null,
      });

      return {
        reply: quoteReply(service, quote, state, language),
        actions: [...actions, quoteAction(service, quote, state)],
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (quote.quantity === null) {
      await persist({
        ...state,
        serviceId: serviceId(service),
        quantity: null,
        lastCharge: null,
      });

      return {
        reply: quoteReply(service, quote, state, language),
        actions: [...actions, quoteAction(service, quote, state)],
        toolTrace: trace,
        model: "deterministic",
      };
    }

    state.quantity = quote.quantity;
    return prepareAndReport(service, quote, state);
  } catch (error) {
    console.error("Deterministic agent fallback failed:", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      reply: ar(
        language,
        "تعذر إكمال الطلب الآن. يمكنك البحث في الخدمات أو إضافة رصيد من القائمة، ثم المحاولة مرة أخرى.",
        "I couldn't complete that right now. You can browse Services or Add funds from the menu and try again."
      ),
      actions,
      toolTrace: trace,
      model: "deterministic",
    };
  }
}

import {
  executeAgentTool,
  type AgentAction,
  type AgentToolContext,
} from "@/lib/agent-tools";
import type { Language } from "@/lib/i18n";
import { formatCurrency, formatNumber } from "@/lib/constants";
import { localizeServiceName } from "@/lib/service-localization";
import { localizeStatusText } from "@/lib/error-messages";

export interface DeterministicAgentInput {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  language: Language;
  page: string;
  context: AgentToolContext;
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

function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|io|me|co)\S*/gi, " ")
    .replace(/(?:service|خدمة|order|طلب|id)\s*#?\d{4,}/gi, " ")
    .replace(/#\s*[A-Za-z0-9_-]{5,}/g, " ");
}

function extractLink(text: string): string | null {
  const url = text.match(/https?:\/\/[^\s<>"']+/i);
  if (url) return url[0].replace(/[),.;]+$/, "");

  const handle = text.match(/(?:^|[\s(])@([A-Za-z0-9._]{2,64})/);
  if (handle) return `@${handle[1]}`;

  return null;
}

function extractPlatform(text: string): string | null {
  const value = text.toLowerCase();
  if (/instagram|انستقرام|انستغرام|إنستغرام|انستا|\big\b/.test(value)) return "instagram";
  if (/tiktok|تيك\s*توك|تيكتوك/.test(value)) return "tiktok";
  if (/youtube|يوتيوب|يوتوب|\byt\b/.test(value)) return "youtube";
  if (/twitter|تويتر|x\.com|إكس/.test(value)) return "twitter";
  if (/facebook|فيسبوك|فيس\s*بوك/.test(value)) return "facebook";
  if (/telegram|تيليجرام|تلجرام/.test(value)) return "telegram";
  if (/snapchat|سناب/.test(value)) return "snapchat";
  if (/spotify|سبوتيفاي/.test(value)) return "spotify";
  if (/linkedin|لينكد/.test(value)) return "linkedin";
  if (/discord|ديسكورد/.test(value)) return "discord";
  if (/whatsapp|واتساب/.test(value)) return "whatsapp";
  return null;
}

function platformFromUrl(link: string | null): string | null {
  if (!link) return null;
  const value = link.toLowerCase();
  if (value.includes("instagram.")) return "instagram";
  if (value.includes("tiktok.")) return "tiktok";
  if (value.includes("youtube.") || value.includes("youtu.be")) return "youtube";
  if (value.includes("x.com") || value.includes("twitter.")) return "twitter";
  if (value.includes("facebook.") || value.includes("fb.com")) return "facebook";
  if (value.includes("t.me") || value.includes("telegram.")) return "telegram";
  if (value.includes("snapchat.")) return "snapchat";
  if (value.includes("spotify.")) return "spotify";
  if (value.includes("linkedin.")) return "linkedin";
  if (value.includes("discord.")) return "discord";
  if (value.includes("wa.me") || value.includes("whatsapp.")) return "whatsapp";
  return null;
}

function extractTarget(text: string): string | null {
  const value = text.toLowerCase();
  if (/story|stories|ستوري|ستوري|قصص/.test(value)) return "story";
  if (/live|بث|مباشر/.test(value)) return "live";
  if (/followers?|subscribers?|members?|متابع|مشترك|أعضاء|اعضاء/.test(value)) {
    return "followers";
  }
  if (/likes?|إعجاب|اعجاب|لايك/.test(value)) return "likes";
  if (/views?|مشاهد|مشاهدة|فيو/.test(value)) return "views";
  if (/comments?|تعليق/.test(value)) return "comments";
  if (/shares?|مشارك|شير/.test(value)) return "shares";
  if (/saves?|حفظ/.test(value)) return "saves";
  if (/reels?|ريلز|ريل/.test(value)) return "reels";
  return null;
}

function extractQuantity(text: string): number | null {
  const clean = normalizeDigits(stripUrls(text)).replace(/[,٬]/g, "");
  const explicit = clean.match(
    /(?:quantity|qty|الكمية|بكمية|عدد)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(k|thousand|ألف|الف)?/i
  );
  const match =
    explicit ??
    clean.match(/(\d+(?:\.\d+)?)\s*(k|thousand|ألف|الف)\b/i) ??
    clean.match(/(\d{2,12})\b/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const multiplier = match[2] ? 1000 : 1;
  return Math.max(1, Math.round(value * multiplier));
}

function wantsRefill(text: string): boolean {
  return /refill|guarantee|ضمان|تعويض|♻/.test(text.toLowerCase());
}

function wantsCheapest(text: string): boolean {
  return /cheap|cheapest|أرخص|ارخص|أقل سعر|اقل سعر/.test(text.toLowerCase());
}

function wantsFastest(text: string): boolean {
  return /fast|fastest|أسرع|اسرع/.test(text.toLowerCase());
}

function extractOrderId(text: string): string | null {
  const match =
    text.match(/(?:order|طلب|#)\s*#?([A-Za-z0-9_-]{6,})/i) ??
    text.match(/#\s*([A-Za-z0-9_-]{6,})/);
  return match ? match[1] : null;
}

function textField(value: unknown, language: Language): string {
  const recordValue = record(value);
  return str(recordValue[language]) || str(recordValue.en);
}

function platformFromContext(context: AgentToolContext): string | null {
  if (context.pageContext.platform) return context.pageContext.platform;
  return extractPlatform(context.pageContext.serviceName ?? "");
}

export function shouldUseDeterministicRouter(text: string): boolean {
  const value = normalizeDigits(text).toLowerCase();
  if (!value.trim()) return false;

  if (
    /balance|wallet|add funds|deposit|upi|utr|رصيد|محفظة|شحن|إيداع|ايداع/.test(
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

  if (/https?:\/\/|@[a-z0-9._]{2,}/i.test(value)) return true;

  const platform = extractPlatform(value);
  const target = extractTarget(value);
  const orderWords = /order|buy|followers?|likes?|views?|comments?|shares?|متابع|لايك|مشاهد|طلب|أريد|اريد/.test(
    value
  );

  return Boolean(platform || target || orderWords);
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  context: AgentToolContext,
  trace: DeterministicAgentResult["toolTrace"],
  actions: AgentAction[]
) {
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

function replyForStatus(
  orders: Array<Record<string, unknown>>,
  language: Language
): string {
  if (orders.length === 0) {
    return language === "ar"
      ? "لا توجد طلبات في حسابك بعد. يمكنني تجهيز طلب جديد إذا أردت."
      : "You have no orders yet. I can prepare a new order if you want.";
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

  return language === "ar"
    ? `هذه حالة أحدث طلباتك:\n${lines.join("\n")}\nيمكنك طلب تعويض أو إلغاء من البطاقات أدناه عند توفر الزر.`
    : `Here is your latest order status:\n${lines.join("\n")}\nUse the refill or cancel buttons on the cards below when eligible.`;
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
  const normalizedText = normalizeDigits(text);

  try {
    const link = extractLink(normalizedText);
    const platform =
      extractPlatform(normalizedText) ??
      platformFromUrl(link) ??
      platformFromContext(context);
    const target = extractTarget(normalizedText);
    const quantity =
      extractQuantity(normalizedText) ??
      context.pageContext.quantity ??
      1000;
    const actionIntent = /refill|cancel|تعويض|إلغاء|الغاء/i.test(
      normalizedText
    );
    const statusIntent =
      /status|my orders?|track|حالة|طلبي|طلباتي/i.test(normalizedText);
    const walletIntent =
      /balance|wallet|add funds|deposit|upi|utr|رصيد|محفظة|شحن|إيداع|ايداع/i.test(
        normalizedText
      );

    if (
      actionIntent &&
      (link === null || !/https?:\/\//i.test(link))
    ) {
      const orderId = extractOrderId(normalizedText);

      if (orderId) {
        const action = /cancel|إلغاء|الغاء/i.test(normalizedText)
          ? "cancel"
          : "refill";
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
            (language === "ar"
              ? "تم تنفيذ الإجراء."
              : "The action was completed."),
          actions,
          toolTrace: trace,
          model: "deterministic",
        };
      }
    }

    if (statusIntent || (actionIntent && !extractOrderId(normalizedText))) {
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

    if (walletIntent) {
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

      const lines = steps
        .slice(0, 3)
        .map((step) => `- ${textField(step, language)}`)
        .join("\n");

      return {
        reply:
          language === "ar"
            ? `رصيد محفظتك الحالي ${formatCurrency(balance)}.\nلإضافة رصيد عبر UPI:\n${lines}`
            : `Your current wallet balance is ${formatCurrency(
                balance
              )}.\nTo add funds via UPI:\n${lines}`,
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    const explicitServiceId = normalizedText.match(
      /(?:service|خدمة|#)\s*#?(\d{3,})/i
    )?.[1];
    let serviceId = explicitServiceId ?? null;
    let selectedService: Record<string, unknown> | null = null;
    let services: Array<Record<string, unknown>> = [];

    if (!serviceId) {
      const searchResult = await runTool(
        "search_catalog_services",
        {
          platform: platform ?? undefined,
          target: target ?? undefined,
          quantity,
          requireRefill: wantsRefill(normalizedText),
          sortBy: wantsCheapest(normalizedText)
            ? "cheapest"
            : wantsFastest(normalizedText)
              ? "fastest"
              : "recommended",
          limit: 5,
        },
        context,
        trace,
        actions
      );
      services = list(record(searchResult?.data).services).map(record);
      selectedService = services[0] ?? null;
      serviceId = str(selectedService?.id) || null;
    }

    if (!serviceId) {
      return {
        reply:
          language === "ar"
            ? "لم أجد خدمة مطابقة. جرّب تحديد المنصة ونوع الخدمة، مثل متابعين إنستغرام أو مشاهدات تيك توك."
            : "I couldn't find a matching service. Try naming the platform and service type, such as Instagram followers or TikTok views.",
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (link) {
      const minQuantity = num(selectedService?.min);
      const maxQuantity = num(selectedService?.max);
      const safeQuantity =
        minQuantity > 0 && quantity < minQuantity
          ? minQuantity
          : maxQuantity > 0 && quantity > maxQuantity
            ? maxQuantity
            : quantity;

      const validation = await runTool(
        "validate_and_normalize_link",
        { serviceId, link },
        context,
        trace,
        actions
      );
      const validationData = record(validation?.data);

      if (!validationData.ok) {
        return {
          reply:
            textField(validationData.message, language) ||
            (language === "ar"
              ? "الرابط غير متوافق مع هذه الخدمة."
              : "This link does not match the selected service."),
          actions,
          toolTrace: trace,
          model: "deterministic",
        };
      }

      const prepared = await runTool(
        "prepare_order_draft",
        {
          serviceId,
          link: str(validationData.normalizedLink) || link,
          quantity: safeQuantity,
        },
        context,
        trace,
        actions
      );
      const preparedData = record(prepared?.data);

      if (!preparedData.ok) {
        const errorMessage =
          typeof preparedData.message === "string"
            ? preparedData.message
            : textField(preparedData.message, language);

        return {
          reply:
            errorMessage ||
            str(preparedData.error) ||
            (language === "ar"
              ? "تعذر تجهيز الطلب."
              : "The order could not be prepared."),
          actions,
          toolTrace: trace,
          model: "deterministic",
        };
      }

      const draft = record(preparedData.orderDraft);
      const rawServiceName = str(draft.serviceName);
      const serviceName =
        language === "ar"
          ? localizeServiceName(rawServiceName)
          : rawServiceName;
      const totalCharge = num(draft.totalCharge);
      const walletBalance = num(draft.walletBalance);
      const canPlace = draft.canPlace === true;

      return {
        reply: language === "ar"
          ? `جهّزت ${serviceName} لـ ${formatNumber(
              num(draft.quantity)
            )} وحدة. الإجمالي ${formatCurrency(
              totalCharge
            )}. رصيد المحفظة ${formatCurrency(walletBalance)}. ${
              canPlace
                ? "راجع النموذج ثم أكد الطلب."
                : "أضف رصيدًا قبل تأكيد الطلب."
            }`
          : `I prepared ${serviceName} for ${formatNumber(
              num(draft.quantity)
            )} units. Total ${formatCurrency(
              totalCharge
            )}. Wallet balance ${formatCurrency(walletBalance)}. ${
              canPlace
                ? "Review the form and confirm the order."
                : "Add funds before confirming."
            }`,
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (services.length > 0) {
      const preview = services
        .slice(0, 3)
        .map((service) => {
          const name = str(service.name);
          return `${language === "ar" ? localizeServiceName(name) : name} · ${formatCurrency(
            num(service.customerRatePer1000)
          )} / 1k`;
        })
        .join("\n");

      return {
        reply:
          language === "ar"
            ? `وجدت ${formatNumber(services.length)} ${
                services.length === 1 ? "خدمة مطابقة" : "خدمات مطابقة"
              }:\n${preview}\nأرسل رابط الهدف أو اسم المستخدم لأجهّز الطلب.`
            : `I found ${formatNumber(
                services.length
              )} matching services:\n${preview}\nSend the target link or username and I'll prepare the order.`,
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    if (serviceId) {
      return {
        reply:
          language === "ar"
            ? "تم اختيار الخدمة. أرسل رابط الهدف أو اسم المستخدم لأجهّز الطلب."
            : "The service is selected. Send the target link or username and I'll prepare the order.",
        actions,
        toolTrace: trace,
        model: "deterministic",
      };
    }

    return {
      reply:
        language === "ar"
          ? "أستطيع مساعدتك في البحث عن خدمة، فحص رابط، تجهيز طلب، متابعة حالة، طلب تعويض أو إلغاء، وإرشادك للإيداع عبر UPI. اكتب مثلاً: أريد 1000 متابع إنستغرام مع ضمان لحسابي @username."
          : "I can search services, check a link, prepare an order, track status, request a refill or cancellation, and guide a UPI deposit. For example: Find 1000 guaranteed Instagram followers for @username.",
      actions,
      toolTrace: trace,
      model: "deterministic",
    };
  } catch (error) {
    console.error("Deterministic agent fallback failed:", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      reply:
        language === "ar"
          ? "تعذر إكمال الطلب الآن. يمكنك البحث في الخدمات أو إضافة رصيد من القائمة، ثم المحاولة مرة أخرى."
          : "I couldn't complete that right now. You can browse Services or Add funds from the menu and try again.",
      actions,
      toolTrace: trace,
      model: "deterministic",
    };
  }
}

/**
 * Deterministic understanding of customer order messages.
 *
 * The assistant must work with the way customers actually write: Gulf/Egyptian
 * Arabic, Arabic number words ("عشرين"), budgets ("بعشرين ربية"), bare handles,
 * links without a scheme, and short confirmations ("أكد"). This module is pure
 * and has no server dependencies so it can be unit tested directly.
 */

export interface OrderSignals {
  platform: string | null;
  target: string | null;
  link: string | null;
  quantity: number | null;
  budget: number | null;
  explicitServiceId: string | null;
  orderVerb: boolean;
  question: boolean;
  confirm: boolean;
  negative: boolean;
  wantsAlternative: boolean;
  wantsCheapest: boolean;
  wantsFastest: boolean;
  wantsRefill: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  صفر: 0,
  واحد: 1,
  وحده: 1,
  وحدة: 1,
  اثنين: 2,
  اثنتين: 2,
  تنين: 2,
  اثنان: 2,
  ثلاثه: 3,
  ثلاث: 3,
  اربعه: 4,
  اربع: 4,
  خمسه: 5,
  خمس: 5,
  سته: 6,
  ست: 6,
  سبعه: 7,
  سبع: 7,
  ثمانيه: 8,
  ثمان: 8,
  تسعه: 9,
  تسع: 9,
  عشره: 10,
  عشر: 10,
  احدعشر: 11,
  اثناعشر: 12,
  ثلاثهعشر: 13,
  اربعهعشر: 14,
  خمسهعشر: 15,
  ستهعشر: 16,
  سبعهعشر: 17,
  ثمانيهعشر: 18,
  تسعهعشر: 19,
  عشرين: 20,
  ثلاثين: 30,
  اربعين: 40,
  خمسين: 50,
  ستين: 60,
  سبعين: 70,
  ثمانين: 80,
  تسعين: 90,
  ميه: 100,
  مئه: 100,
  مائه: 100,
  ميتين: 200,
  مئتين: 200,
  ثلاثميه: 300,
  ثلاثمئه: 300,
  اربعميه: 400,
  اربعمئه: 400,
  خمسميه: 500,
  خمسمئه: 500,
  ستميه: 600,
  ستمئه: 600,
  سبعميه: 700,
  سبعمئه: 700,
  ثمانميه: 800,
  ثمانمئه: 800,
  تسعميه: 900,
  تسعمئه: 900,
  الف: 1000,
  الاف: 1000,
  الفين: 2000,
  الافين: 2000,
  مليون: 1_000_000,
  مليونين: 2_000_000,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
  million: 1_000_000,
};

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeAgentText(input: string): string {
  let text = String(input ?? "");

  for (const digit of ARABIC_DIGITS) {
    text = text.split(digit).join(String(ARABIC_DIGITS.indexOf(digit)));
  }
  for (const digit of PERSIAN_DIGITS) {
    text = text.split(digit).join(String(PERSIAN_DIGITS.indexOf(digit)));
  }

  return text
    .normalize("NFKC")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[،؛]/g, " ")
    .replace(/[\u200e\u200f]/g, " ");
}

function numericTokenValue(token: string): number | null {
  const clean = token
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "");

  if (!clean) return null;

  const direct = NUMBER_WORDS[clean];
  if (direct !== undefined) return direct;

  for (const prefix of ["و", "ب", "ل"]) {
    if (clean.startsWith(prefix) && clean.length > prefix.length) {
      const stripped = NUMBER_WORDS[clean.slice(prefix.length)];
      if (stripped !== undefined) return stripped;
    }
  }

  return null;
}

export function parseNumberPhrase(phrase: string): number | null {
  const tokens = normalizeAgentText(phrase)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  let total = 0;
  let current = 0;
  let matched = 0;

  for (const token of tokens) {
    const value = numericTokenValue(token);

    if (value === null) {
      if (matched > 0) break;
      continue;
    }

    matched += 1;

    if (value >= 1000) {
      current = (current || 1) * value;
      total += current;
      current = 0;
    } else if (value >= 100) {
      // "خمس مية" = 5 × 100, while "مية وخمسين" = 100 + 50.
      current = current > 0 && current < 100 ? current * value : current + value;
    } else {
      current += value;
    }
  }

  if (matched === 0) return null;

  const result = total + current;
  return Number.isFinite(result) && result > 0 ? result : null;
}

function trailingNumberPhrase(
  before: string
): { amount: number; start: number } | null {
  const matches = [...before.matchAll(/\S+/g)];
  const selected: Array<{ token: string; index: number }> = [];

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if (selected.length >= 6) break;

    const raw = matches[index][0];
    const token = raw
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .replace(/[^\p{L}\p{N}]+$/u, "");

    if (!token || numericTokenValue(token) === null) break;

    selected.unshift({
      token,
      index: matches[index].index ?? 0,
    });
  }

  if (selected.length === 0) return null;

  const amount = parseNumberPhrase(selected.map((item) => item.token).join(" "));

  if (!amount) return null;

  return { amount, start: selected[0].index };
}

const CURRENCY_SOURCE = String.raw`(?:₹|(?<![a-z])(?:inr|rs\.?|rupees?|rupaye?s?)(?![a-z])|روبي[هة]?|ربيه|ريال\s*هندي)`;

export interface BudgetMatch {
  amount: number;
  text: string;
}

export function extractBudget(text: string): BudgetMatch | null {
  const normalized = normalizeAgentText(text).toLowerCase();

  const numberWithCurrency = new RegExp(
    String.raw`(\d+(?:[.,]\d+)?)\s*${CURRENCY_SOURCE}`,
    "i"
  );
  const direct = normalized.match(numberWithCurrency);

  if (direct) {
    const amount = Number.parseFloat(direct[1].replace(",", "."));
    if (Number.isFinite(amount) && amount > 0) {
      return { amount, text: direct[0] };
    }
  }

  const currencyFirst = new RegExp(
    String.raw`${CURRENCY_SOURCE}\s*(\d+(?:[.,]\d+)?)`,
    "i"
  );
  const currencyMatch = normalized.match(currencyFirst);

  if (currencyMatch) {
    const amount = Number.parseFloat(currencyMatch[1].replace(",", "."));
    if (Number.isFinite(amount) && amount > 0) {
      return { amount, text: currencyMatch[0] };
    }
  }

  const currencyOnly = new RegExp(CURRENCY_SOURCE, "i");
  const marker = normalized.match(currencyOnly);

  const markerIndex = marker?.index ?? -1;

  if (marker && markerIndex > 0) {
    const trailing = trailingNumberPhrase(normalized.slice(0, markerIndex));

    if (trailing) {
      return {
        amount: trailing.amount,
        text: normalized.slice(
          trailing.start,
          markerIndex + marker[0].length
        ),
      };
    }
  }

  const labelled = normalized.match(
    /(?:ميزانيتي|ميزانيه|ميزانية|بمبلغ|بقيمه|بقيمة|budget)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i
  );

  if (labelled) {
    const amount = Number.parseFloat(labelled[1].replace(",", "."));
    if (Number.isFinite(amount) && amount > 0) {
      return { amount, text: labelled[0] };
    }
  }

  return null;
}

const TARGET_WORD_SOURCE = String.raw`(?:متابع(?:ين|ات|ه)?|فولور(?:ز)?|مشترك(?:ين|ات)?|عضو|اعضاء|ممبر(?:ز)?|لايك(?:ات)?|اعجاب(?:ات)?|مشاهد(?:ات)?|مشاهده|فيو(?:ز)?|تعليق(?:ات)?|كومنت(?:ات)?|مشارك(?:ه|ات)?|شير(?:ز)?|حفظ|سيف(?:ز)?|ستوري|قصص|قصة|بث|مباشر|ريل(?:ز)?|فيديو(?:ز)?|subscribers?|followers?|likes?|views?|comments?|shares?|saves?|plays?|members?|reels?|followers)`;

export function extractQuantity(text: string): number | null {
  const normalized = normalizeAgentText(text).toLowerCase();
  const withoutLinks = normalized
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(
      /\b(?:www\.)?(?:instagram\.com|instagr\.am|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|facebook\.com|fb\.com|t\.me|telegram\.me|snapchat\.com|open\.spotify\.com|linkedin\.com|discord\.gg|wa\.me)\/\S*/gi,
      " "
    )
    .replace(/(?:service|خدمه|خدمة|#)\s*#?\d{3,}/gi, " ")
    .replace(
      /\d+(?:[.,]\d+)?\s*(?:دولار|دولارات|درهم|دراهم|ريال\s*سعودي|دينار|دنانير|يورو|جنيه|usd|dollars?|aed|sar|eur|gbp)(?![a-z])/gi,
      " "
    );

  const explicit = withoutLinks.match(
    /(?:الكميه|الكمية|كميه|كمية|عدد|qty|quantity)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(k|thousand|الف|الاف)?/i
  );

  if (explicit) {
    const amount = Number.parseFloat(explicit[1].replace(",", "."));

    if (Number.isFinite(amount) && amount > 0) {
      return Math.round(amount * (explicit[2] ? 1000 : 1));
    }
  }

  const targetAdjacent = withoutLinks.match(
    new RegExp(
      String.raw`(\d+(?:[.,]\d+)?)\s*(k|thousand|الف|الاف)?\s*${TARGET_WORD_SOURCE}`,
      "i"
    )
  );

  if (targetAdjacent) {
    const amount = Number.parseFloat(targetAdjacent[1].replace(",", "."));

    if (Number.isFinite(amount) && amount > 0) {
      return Math.round(amount * (targetAdjacent[2] ? 1000 : 1));
    }
  }

  const targetFirst = withoutLinks.match(
    new RegExp(
      String.raw`${TARGET_WORD_SOURCE}\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(k|thousand|الف|الاف)?`,
      "i"
    )
  );

  if (targetFirst) {
    const amount = Number.parseFloat(targetFirst[1].replace(",", "."));

    if (Number.isFinite(amount) && amount > 0) {
      return Math.round(amount * (targetFirst[2] ? 1000 : 1));
    }
  }

  const numberBeforeTarget = withoutLinks.match(new RegExp(TARGET_WORD_SOURCE, "i"));

  const numberBeforeTargetIndex = numberBeforeTarget?.index ?? -1;

  if (numberBeforeTarget && numberBeforeTargetIndex > 0) {
    const trailing = trailingNumberPhrase(
      withoutLinks.slice(0, numberBeforeTargetIndex)
    );

    if (trailing) return trailing.amount;
  }

  const thousands = withoutLinks.match(
    /(\d+(?:[.,]\d+)?)\s*(k|thousand|الف|الاف)\b/i
  );

  if (thousands) {
    const amount = Number.parseFloat(thousands[1].replace(",", "."));

    if (Number.isFinite(amount) && amount > 0) {
      return Math.round(amount * 1000);
    }
  }

  const standalone = withoutLinks.match(/\b(\d{2,9})\b/);

  if (standalone) {
    const amount = Number.parseInt(standalone[1], 10);

    if (Number.isFinite(amount) && amount > 0) return amount;
  }

  return null;
}

export function extractPlatform(text: string): string | null {
  const value = normalizeAgentText(text).toLowerCase();

  if (/instagram|انستقرام|انستغرام|انستا|\big\b/.test(value)) {
    return "instagram";
  }
  if (/tiktok|تيك\s*توك|تيكتوك/.test(value)) return "tiktok";
  if (/youtube|يوتيوب|يوتوب|\byt\b/.test(value)) return "youtube";
  if (/twitter|تويتر|x\.com|منصه\s*اكس|\bx\b/.test(value)) return "twitter";
  if (/facebook|فيسبوك|فيس\s*بوك|fb\.com/.test(value)) return "facebook";
  if (/telegram|تيليجرام|تلجرام|t\.me/.test(value)) return "telegram";
  if (/snapchat|سناب/.test(value)) return "snapchat";
  if (/spotify|سبوتيفاي/.test(value)) return "spotify";
  if (/linkedin|لينكد/.test(value)) return "linkedin";
  if (/discord|ديسكورد/.test(value)) return "discord";
  if (/whatsapp|واتساب|wa\.me/.test(value)) return "whatsapp";

  return null;
}

export function extractTarget(text: string): string | null {
  const value = normalizeAgentText(text).toLowerCase();

  if (/story|stories|ستوري|قصص|قصة/.test(value)) return "story";
  if (/live|بث|مباشر/.test(value)) return "live";
  if (
    /followers?|subscribers?|members?|متابع|مشترك|أعضاء|اعضاء|عضو|ممبر|فولور/.test(
      value
    )
  ) {
    return "followers";
  }
  if (/likes?|إعجاب|اعجاب|لايك/.test(value)) return "likes";
  if (/views?|plays?|مشاهد|مشاهدة|مشاهده|فيو/.test(value)) return "views";
  if (/comments?|تعليق|كومنت/.test(value)) return "comments";
  if (/shares?|مشارك|شير/.test(value)) return "shares";
  if (/saves?|حفظ|سيف/.test(value)) return "saves";
  if (/reels?|ريلز|ريل/.test(value)) return "reels";
  if (/impressions?|reach|وصول|تفاعل/.test(value)) return "views";

  return null;
}

export function extractLink(text: string): string | null {
  const url = String(text ?? "").match(/https?:\/\/[^\s<>"']+/i);

  if (url) return url[0].replace(/[),.;!?]+$/, "");

  const bareDomain = String(text ?? "").match(
    /(?:^|[\s(])((?:www\.)?(?:instagram\.com|instagr\.am|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|facebook\.com|fb\.com|t\.me|telegram\.me|snapchat\.com|open\.spotify\.com|linkedin\.com|discord\.gg|wa\.me)\/[^\s<>"')]+)/i
  );

  if (bareDomain) {
    return `https://${bareDomain[1].replace(/[),.;!?]+$/, "")}`;
  }

  const handle = String(text ?? "").match(/(?:^|[\s(])@([A-Za-z0-9._]{2,64})/);

  if (handle) return `@${handle[1]}`;

  const trimmed = String(text ?? "").trim();

  if (
    /^@?[A-Za-z0-9._-]{2,64}$/.test(trimmed) &&
    /[A-Za-z]/.test(trimmed) &&
    !/^\d+$/.test(trimmed)
  ) {
    return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  }

  return null;
}

export function extractExplicitServiceId(text: string): string | null {
  const value = normalizeAgentText(text);
  const match =
    value.match(/(?:service|الخدمه|خدمه|خدمة|#)\s*#?(\d{3,})/i) ??
    value.match(/\b(?:id|ايدي)\s*[:=]?\s*(\d{3,})/i);

  return match ? match[1] : null;
}

export function isConfirmMessage(text: string): boolean {
  const value = normalizeAgentText(text).toLowerCase().trim();

  if (!value) return false;

  if (
    /^(?:اكد|اكدلي|اكده|نفذ|نفذها|تمم|تممها|اشتري|اشتر|اشتريها|اطلب|اطلبها|كمل|كملها|سوها|يلا|يلا\s+نفذ|confirm|confirmed|yes|yep|ok|okay|sure|place\s+(?:the\s+)?order|buy\s+(?:it|now)|go\s+ahead|do\s+it|proceed)(?:\s|$|!|\.)/.test(
      value
    )
  ) {
    return true;
  }

  if (/^(?:تم|خلاص|ابشر)$/.test(value)) return true;

  return /(?:اكد\s+الطلب|نفذ\s+الطلب|اشتري\s+الان|اطلب\s+الان|كمل\s+الطلب|confirm\s+(?:the\s+)?order|place\s+(?:my|the)\s+order)/.test(
    value
  );
}

export function isNegativeMessage(text: string): boolean {
  const value = normalizeAgentText(text).toLowerCase().trim();

  if (!value) return false;

  return /^(?:لا|كلا|الغ|الغي|الغاء|مو|مش|توقف|بعدين|لاحقا|لا\s+شكرا|no|nope|cancel|stop|not\s+now)(?:\s|$|!|\.)/.test(
    value
  );
}

export function wantsAlternative(text: string): boolean {
  return /(?:خدمه\s+ثانيه|خدمة\s+ثانية|غيرها|بدلها|بديل|شي\s+ثاني|خيار\s+ثاني|another|different|next\s+option|other\s+service)/i.test(
    normalizeAgentText(text)
  );
}

export function looksLikeQuestion(text: string): boolean {
  return /كيف|ليش|لماذا|ماذا|ما هو|ما هي|وش هو|وش هي|ايش|إيش|أين|اين|وين|هل |اشرح|وضح|معنى|الفرق|كم\s*(?:سعر|تكلف|ثمن|بكم|يكون|هي|هو)|بكم|\bhow\b|\bwhat\b|\bwhy\b|\bwhere\b|\bcan i\b|\bdo i\b|\bexplain\b|\bdifference\b|\bmeaning\b/i.test(
    normalizeAgentText(text)
  );
}

export function hasOrderVerb(text: string): boolean {
  return /اشتي|اشتري|ابغي|ابي|عايز|عاوز|بدي|اريد|احتاج|محتاج|ابحث|رشح|اقترح|order|want|need|buy|get me|اعطني/i.test(
    normalizeAgentText(text)
  );
}

export function parseOrderSignals(text: string): OrderSignals {
  const budget = extractBudget(text);
  const withoutBudget = budget
    ? normalizeAgentText(text).replace(budget.text, " ")
    : text;

  return {
    platform: extractPlatform(text),
    target: extractTarget(text),
    link: extractLink(text),
    quantity: extractQuantity(withoutBudget),
    budget: budget?.amount ?? null,
    explicitServiceId: extractExplicitServiceId(text),
    orderVerb: hasOrderVerb(text),
    question: looksLikeQuestion(text),
    confirm: isConfirmMessage(text),
    negative: isNegativeMessage(text),
    wantsAlternative: wantsAlternative(text),
    wantsCheapest: /cheap|cheapest|ارخص|أرخص|اقل سعر|أقل سعر/i.test(
      normalizeAgentText(text)
    ),
    wantsFastest: /fast|fastest|اسرع|أسرع/i.test(normalizeAgentText(text)),
    wantsRefill: /refill|guarantee|ضمان|تعويض|♻/i.test(normalizeAgentText(text)),
  };
}

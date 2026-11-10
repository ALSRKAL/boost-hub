import type { PlatformKey } from "@/lib/service-platforms";
import { getPlatformMetaForService } from "@/lib/service-platforms";
import {
  formatAverageTimeBilingual,
  pick,
  type Bilingual,
  type Language,
} from "@/lib/i18n";
import { formatCurrency } from "@/lib/constants";
import { parseRefillWindowHours } from "@/lib/refill-utils";

export type ServiceTarget =
  | "profile"
  | "post"
  | "story"
  | "live"
  | "track"
  | "website"
  | "unknown";

export interface GuidableService {
  id: string;
  name: string;
  category: string;
  type: string;
  refill: boolean;
  cancel: boolean;
  dripfeed: boolean;
  averageTime: string | null;
  min: number;
  max: number;
  price: string;
}

export interface GuidanceChecklistItem {
  id: string;
  text: Bilingual;
  critical?: boolean;
}

export interface ServiceGuidance {
  platform: PlatformKey;
  platformLabel: string;
  target: ServiceTarget;
  targetLabel: Bilingual;
  placeholder: Bilingual;
  example: Bilingual;
  instructions: Bilingual;
  checklist: GuidanceChecklistItem[];
  refill: Bilingual;
  refillDetail: Bilingual;
  cancel: Bilingual;
  cancelDetail: Bilingual;
  dripfeed: Bilingual;
  speed: Bilingual;
  pricing: Bilingual;
  range: Bilingual;
  normalizeCta: Bilingual;
}

export type LinkIssue =
  | "profile-post"
  | "post-profile"
  | "story-link"
  | "live-link"
  | "platform"
  | "invalid";

export interface ServiceLinkValidation {
  error?: Bilingual;
  warning?: Bilingual;
  normalized?: string;
  issue?: LinkIssue;
}

const b = (en: string, ar: string): Bilingual => ({ en, ar });

const TARGET_LABELS: Record<ServiceTarget, Bilingual> = {
  profile: b("Profile / channel link", "رابط الملف الشخصي أو القناة"),
  post: b("Specific post / video link", "رابط منشور أو فيديو محدد"),
  story: b("Story link", "رابط الستوري"),
  live: b("Live stream link", "رابط البث المباشر"),
  track: b("Track link", "رابط المقطع الصوتي"),
  website: b("Website URL", "رابط الموقع"),
  unknown: b("Target link", "رابط الهدف"),
};

const STORY_PATTERN = /\b(story|stories)\b|(ستوري|قصص)/i;
const LIVE_PATTERN = /\b(live|premiere)\b|(بث|مباشر)/i;
const PROFILE_PATTERN =
  /\b(followers?|subscribers?|members?|joins?|profile)\b|(متابع|مشترك|عضو|حساب)/i;
const POST_PATTERN =
  /\b(likes?|views?|comments?|shares?|saves?|reels?|shorts?|videos?|posts?|impressions?|reach|reactions?|plays?|streams?|listeners?)\b|(إعجاب|مشاهد|تعليق|مشارك|حفظ|ريلز|فيديو|منشور|وصول|تفاعل)/i;

const POST_URL_PATTERN =
  /\/(p|reel|reels|tv|video|videos|shorts|stories|story|live|status|watch|clip|posts?|permalink)\/|[?&]v=|story_fbid=|watch\?v=/i;

const PLATFORM_HOSTS: Record<PlatformKey, string[]> = {
  instagram: ["instagram.com", "instagr.am"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be", "m.youtube.com"],
  twitter: ["x.com", "twitter.com", "mobile.twitter.com"],
  facebook: ["facebook.com", "fb.com", "m.facebook.com"],
  telegram: ["t.me", "telegram.me", "telegram.dog"],
  whatsapp: ["wa.me", "whatsapp.com", "chat.whatsapp.com"],
  snapchat: ["snapchat.com"],
  spotify: ["open.spotify.com", "spotify.com"],
  linkedin: ["linkedin.com"],
  discord: ["discord.gg", "discord.com"],
  website: [],
  other: [],
};

const PLACEHOLDERS: Record<
  PlatformKey,
  Partial<Record<ServiceTarget, Bilingual>>
> = {
  instagram: {
    profile: b("https://www.instagram.com/username", "https://www.instagram.com/username"),
    post: b(
      "https://www.instagram.com/reel/… or /p/…",
      "https://www.instagram.com/reel/… أو /p/…"
    ),
    story: b(
      "https://www.instagram.com/stories/username/…",
      "https://www.instagram.com/stories/username/…"
    ),
    live: b(
      "https://www.instagram.com/live/…",
      "https://www.instagram.com/live/…"
    ),
  },
  tiktok: {
    profile: b("https://www.tiktok.com/@username", "https://www.tiktok.com/@username"),
    post: b(
      "https://www.tiktok.com/@username/video/…",
      "https://www.tiktok.com/@username/video/…"
    ),
  },
  youtube: {
    profile: b(
      "https://www.youtube.com/@channel",
      "https://www.youtube.com/@channel"
    ),
    post: b(
      "https://www.youtube.com/watch?v=… or /shorts/…",
      "https://www.youtube.com/watch?v=… أو /shorts/…"
    ),
    live: b(
      "https://www.youtube.com/live/…",
      "https://www.youtube.com/live/…"
    ),
  },
  twitter: {
    profile: b("https://x.com/username", "https://x.com/username"),
    post: b(
      "https://x.com/username/status/…",
      "https://x.com/username/status/…"
    ),
  },
  facebook: {
    profile: b("https://www.facebook.com/page", "https://www.facebook.com/page"),
    post: b(
      "https://www.facebook.com/…/posts/…",
      "https://www.facebook.com/…/posts/…"
    ),
    live: b(
      "https://www.facebook.com/…/videos/…",
      "https://www.facebook.com/…/videos/…"
    ),
  },
  telegram: {
    profile: b("https://t.me/channel", "https://t.me/channel"),
    post: b("https://t.me/channel/123", "https://t.me/channel/123"),
  },
  snapchat: {
    profile: b(
      "https://www.snapchat.com/add/username",
      "https://www.snapchat.com/add/username"
    ),
    story: b(
      "https://www.snapchat.com/add/username",
      "https://www.snapchat.com/add/username"
    ),
  },
  spotify: {
    track: b(
      "https://open.spotify.com/track/…",
      "https://open.spotify.com/track/…"
    ),
    profile: b(
      "https://open.spotify.com/artist/…",
      "https://open.spotify.com/artist/…"
    ),
  },
  linkedin: {
    profile: b(
      "https://www.linkedin.com/in/username",
      "https://www.linkedin.com/in/username"
    ),
    post: b(
      "https://www.linkedin.com/posts/…",
      "https://www.linkedin.com/posts/…"
    ),
  },
  discord: {
    profile: b(
      "https://discord.gg/invite-code",
      "https://discord.gg/invite-code"
    ),
  },
  website: {
    website: b("https://example.com/page", "https://example.com/page"),
  },
  whatsapp: {
    profile: b("https://whatsapp.com/channel/…", "https://whatsapp.com/channel/…"),
    post: b("https://wa.me/1234567890", "https://wa.me/1234567890"),
  },
  other: {
    unknown: b("https://… or @username", "https://… أو @username"),
  },
};

const INSTRUCTIONS: Record<
  PlatformKey,
  Partial<Record<ServiceTarget, Bilingual>>
> = {
  instagram: {
    profile: b(
      "Paste the full Instagram profile URL. Do not paste a post, reel, story, or live link.",
      "الصق رابط الملف الشخصي الكامل على إنستغرام. لا تضع رابط منشور أو ريلز أو ستوري أو بث مباشر."
    ),
    post: b(
      "Paste the exact post, reel, or video URL. A profile link will not work.",
      "الصق رابط المنشور أو الريلز أو الفيديو المحدد. رابط الملف الشخصي لن يعمل."
    ),
    story: b(
      "Paste the story URL or the profile URL while the story is active. The account must be public.",
      "الصق رابط الستوري أو رابط الملف الشخصي أثناء نشاط الستوري. يجب أن يكون الحساب عامًا."
    ),
    live: b(
      "Paste the live stream URL while the stream is running. The account must be public.",
      "الصق رابط البث المباشر أثناء تشغيل البث. يجب أن يكون الحساب عامًا."
    ),
  },
  tiktok: {
    profile: b(
      "Paste the TikTok profile URL, for example https://www.tiktok.com/@username.",
      "الصق رابط ملف تيك توك الشخصي، مثال: https://www.tiktok.com/@username."
    ),
    post: b(
      "Paste the exact TikTok video URL, for example https://www.tiktok.com/@username/video/….",
      "الصق رابط فيديو تيك توك المحدد، مثال: https://www.tiktok.com/@username/video/…."
    ),
  },
  youtube: {
    profile: b(
      "Paste the channel URL: /@handle, /channel/ID, /c/name, or /user/name.",
      "الصق رابط القناة: /@handle أو /channel/ID أو /c/name أو /user/name."
    ),
    post: b(
      "Paste the exact video or Shorts URL. Private and unlisted videos are not accepted.",
      "الصق رابط الفيديو أو الشورتس المحدد. لا تُقبل الفيديوهات الخاصة أو غير المدرجة."
    ),
    live: b(
      "Paste the YouTube live URL while the stream is running.",
      "الصق رابط البث المباشر على يوتيوب أثناء تشغيل البث."
    ),
  },
  twitter: {
    profile: b(
      "Paste the X/Twitter profile URL. The account must be public.",
      "الصق رابط الحساب على X/تويتر. يجب أن يكون الحساب عامًا."
    ),
    post: b(
      "Paste the exact post URL containing /status/…. A profile link will not work.",
      "الصق رابط المنشور المحدد الذي يحتوي على /status/…. رابط الملف الشخصي لن يعمل."
    ),
  },
  facebook: {
    profile: b(
      "Paste the Facebook page or profile URL. The page must be public.",
      "الصق رابط صفحة أو ملف فيسبوك. يجب أن تكون الصفحة عامة."
    ),
    post: b(
      "Paste the exact post, reel, or video URL. A page link will not work.",
      "الصق رابط المنشور أو الريلز أو الفيديو المحدد. رابط الصفحة لن يعمل."
    ),
    live: b(
      "Paste the live video URL while the stream is running.",
      "الصق رابط الفيديو المباشر أثناء تشغيل البث."
    ),
  },
  telegram: {
    profile: b(
      "Paste the public channel URL, for example https://t.me/channel. Private channels cannot be processed.",
      "الصق رابط القناة العامة، مثال: https://t.me/channel. لا يمكن معالجة القنوات الخاصة."
    ),
    post: b(
      "Paste the exact message URL, for example https://t.me/channel/123.",
      "الصق رابط الرسالة المحدد، مثال: https://t.me/channel/123."
    ),
  },
  snapchat: {
    profile: b(
      "Paste the Snapchat profile URL, for example https://www.snapchat.com/add/username.",
      "الصق رابط ملف سناب شات، مثال: https://www.snapchat.com/add/username."
    ),
    story: b(
      "Paste the profile URL and keep the story public for the whole order.",
      "الصق رابط الملف الشخصي واترك الستوري عامًا طوال مدة الطلب."
    ),
  },
  spotify: {
    track: b(
      "Paste the exact Spotify track URL.",
      "الصق رابط المقطع الصوتي المحدد على سبوتيفاي."
    ),
    profile: b(
      "Paste the Spotify artist or profile URL.",
      "الصق رابط الفنان أو الملف الشخصي على سبوتيفاي."
    ),
  },
  linkedin: {
    profile: b(
      "Paste the LinkedIn profile or company URL.",
      "الصق رابط ملف لينكدإن الشخصي أو صفحة الشركة."
    ),
    post: b(
      "Paste the exact LinkedIn post URL.",
      "الصق رابط منشور لينكدإن المحدد."
    ),
  },
  discord: {
    profile: b(
      "Paste a permanent Discord invite link. The invite must not expire.",
      "الصق رابط دعوة ديسكورد دائم. يجب ألا تنتهي صلاحية الدعوة."
    ),
  },
  whatsapp: {
    profile: b(
      "Paste the WhatsApp channel URL or the number in international format.",
      "الصق رابط قناة واتساب أو الرقم بالصيغة الدولية."
    ),
  },
  website: {
    website: b(
      "Paste the full https:// page URL. The page must be reachable without a login.",
      "الصق رابط الصفحة الكامل https://. يجب أن تكون الصفحة متاحة دون تسجيل دخول."
    ),
  },
  other: {
    unknown: b(
      "Paste the exact profile, post, or content URL required by this service.",
      "الصق رابط الملف الشخصي أو المنشور أو المحتوى المطلوب لهذه الخدمة."
    ),
  },
};

const PLATFORM_NAMES: Record<PlatformKey, Bilingual> = {
  instagram: b("Instagram", "إنستغرام"),
  tiktok: b("TikTok", "تيك توك"),
  youtube: b("YouTube", "يوتيوب"),
  twitter: b("X / Twitter", "X / تويتر"),
  facebook: b("Facebook", "فيسبوك"),
  telegram: b("Telegram", "تيليجرام"),
  snapchat: b("Snapchat", "سناب شات"),
  spotify: b("Spotify", "سبوتيفاي"),
  linkedin: b("LinkedIn", "لينكدإن"),
  discord: b("Discord", "ديسكورد"),
  whatsapp: b("WhatsApp", "واتساب"),
  website: b("Website", "موقع إلكتروني"),
  other: b("Other", "أخرى"),
};

export function detectServiceTarget(service: {
  name: string;
  category: string;
  type: string;
}): ServiceTarget {
  // The service name is the reliable signal. Provider categories often contain
  // promo words such as "Diwali Sale is Live" that must not turn every service
  // in the category into a live-stream service.
  const name = service.name;

  if (STORY_PATTERN.test(name)) return "story";
  if (LIVE_PATTERN.test(name)) return "live";
  if (PROFILE_PATTERN.test(name)) return "profile";
  if (/\b(plays?|streams?|listeners?)\b/i.test(name)) return "track";
  if (POST_PATTERN.test(name)) return "post";

  const metadata = `${service.category} ${service.type}`;

  if (STORY_PATTERN.test(metadata)) return "story";
  if (LIVE_PATTERN.test(metadata)) return "live";
  if (PROFILE_PATTERN.test(metadata)) return "profile";
  if (/\b(plays?|streams?|listeners?)\b/i.test(metadata)) return "track";
  if (POST_PATTERN.test(metadata)) return "post";

  return "unknown";
}

function placeholderFor(
  platform: PlatformKey,
  target: ServiceTarget
): Bilingual {
  return (
    PLACEHOLDERS[platform]?.[target] ??
    PLACEHOLDERS[platform]?.unknown ??
    PLACEHOLDERS.other.unknown!
  );
}

function instructionsFor(
  platform: PlatformKey,
  target: ServiceTarget
): Bilingual {
  return (
    INSTRUCTIONS[platform]?.[target] ??
    INSTRUCTIONS[platform]?.unknown ??
    INSTRUCTIONS.other.unknown!
  );
}

function refillSpec(service: GuidableService): {
  label: Bilingual;
  detail: Bilingual;
} {
  const hours = parseRefillWindowHours(service.name, service.refill);

  if (hours === 0) {
    return {
      label: b("No Refill", "بدون ضمان تعويض"),
      detail: b(
        "This service does not include a refill guarantee.",
        "هذه الخدمة لا تشمل ضمان تعويض."
      ),
    };
  }

  if (hours === Number.POSITIVE_INFINITY) {
    return {
      label: b("Lifetime Refill", "ضمان تعويض مدى الحياة"),
      detail: b(
        "A Refill button appears after completion and remains available for the lifetime guarantee.",
        "يظهر زر التعويض بعد اكتمال الطلب ويبقى متاحًا وفق الضمان مدى الحياة."
      ),
    };
  }

  if (typeof hours === "number" && hours > 0) {
    const days = Math.round(hours / 24);
    const label =
      days >= 1
        ? b(`${days}-Day Refill`, `ضمان تعويض ${days} يومًا`)
        : b(`${hours}-Hour Refill`, `ضمان تعويض ${hours} ساعة`);
    const detail =
      days >= 1
        ? b(
            `Use the Refill button after completion. The ${days}-day guarantee starts when the order completes.`,
            `استخدم زر التعويض بعد الاكتمال. يبدأ ضمان ${days} يومًا عند اكتمال الطلب.`
          )
        : b(
            `Use the Refill button after completion. The ${hours}-hour guarantee starts when the order completes.`,
            `استخدم زر التعويض بعد الاكتمال. يبدأ ضمان ${hours} ساعة عند اكتمال الطلب.`
          );

    return { label, detail };
  }

  return {
    label: service.refill
      ? b("Refill Guarantee", "ضمان تعويض")
      : b("No Refill", "بدون ضمان تعويض"),
    detail: service.refill
      ? b(
          "A Refill button appears after the order completes.",
          "يظهر زر التعويض بعد اكتمال الطلب."
        )
      : b(
          "This service does not include a refill guarantee.",
          "هذه الخدمة لا تشمل ضمان تعويض."
        ),
  };
}

function checklistFor(
  platform: PlatformKey,
  target: ServiceTarget,
  service: GuidableService
): GuidanceChecklistItem[] {
  const items: GuidanceChecklistItem[] = [
    {
      id: "public",
      critical: true,
      text: b(
        "The account, channel, and content must stay public before and during the order.",
        "يجب أن يبقى الحساب والقناة والمحتوى عامًا قبل الطلب وأثناءه."
      ),
    },
  ];

  if (platform === "instagram" && target === "profile") {
    items.push({
      id: "flag-for-review",
      critical: true,
      text: b(
        'Instagram: Settings → Follow and invite friends → turn off "Flag for review" so incoming followers are approved automatically.',
        'إنستغرام: الإعدادات ← المتابعة ودعوة الأصدقاء ← أوقف "تمييز للمراجعة" حتى تتم الموافقة على المتابعين تلقائيًا.'
      ),
    });
  }

  if (target === "story") {
    items.push({
      id: "story-active",
      critical: true,
      text: b(
        "The story must be active and public for the whole delivery window.",
        "يجب أن يكون الستوري نشطًا وعامًا طوال فترة التنفيذ."
      ),
    });
  }

  if (target === "live") {
    items.push({
      id: "live-active",
      critical: true,
      text: b(
        "The live stream must remain running and public during delivery.",
        "يجب أن يبقى البث المباشر قيد التشغيل وعامًا أثناء التنفيذ."
      ),
    });
  }

  if (platform === "telegram") {
    items.push({
      id: "telegram-public",
      text: b(
        "Telegram channels must have a public @username; private invite-only channels are rejected.",
        "يجب أن تمتلك قنوات تيليجرام معرفًا عامًا @username؛ القنوات الخاصة بالدعوة فقط مرفوضة."
      ),
    });
  }

  if (platform === "youtube") {
    items.push({
      id: "youtube-public",
      text: b(
        "Private or unlisted YouTube videos cannot be processed.",
        "لا يمكن معالجة فيديوهات يوتيوب الخاصة أو غير المدرجة."
      ),
    });
  }

  if (target === "profile" || target === "post") {
    items.push({
      id: "link-type",
      text:
        target === "profile"
          ? b(
              "Use a profile/channel URL, not a post, reel, or video URL.",
              "استخدم رابط الملف الشخصي أو القناة، وليس رابط منشور أو ريلز أو فيديو."
            )
          : b(
              "Use the exact post, reel, or video URL, not the profile URL.",
              "استخدم رابط المنشور أو الريلز أو الفيديو المحدد، وليس رابط الملف الشخصي."
            ),
    });
  }

  items.push(
    {
      id: "no-duplicate",
      text: b(
        "Do not submit another order for the same link and service until this order finishes.",
        "لا تُرسل طلبًا آخر لنفس الرابط ونفس الخدمة حتى ينتهي هذا الطلب."
      ),
    },
    {
      id: "no-changes",
      text: b(
        "Do not change the @username, delete the post, or hide the account while the order is Pending or In progress.",
        "لا تغيّر اسم المستخدم @username أو تحذف المنشور أو تخفِ الحساب أثناء حالة الانتظار أو التنفيذ."
      ),
    }
  );

  if (service.dripfeed) {
    items.push({
      id: "dripfeed",
      text: b(
        "Drip-feed orders deliver in scheduled runs; keep the link public until the final run.",
        "طلبات التغذية المرحلية تُسلّم على دفعات مجدولة؛ أبقِ الرابط عامًا حتى الدفعة الأخيرة."
      ),
    });
  }

  return items;
}

export function getServiceGuidance(service: GuidableService): ServiceGuidance {
  const platformMeta = getPlatformMetaForService({
    name: service.name,
    category: service.category,
  });
  const platform = platformMeta.key;
  let target = detectServiceTarget(service);

  if (platform === "website") {
    target = "website";
  } else if (
    platform === "spotify" &&
    /\b(plays?|streams?|listeners?)\b/i.test(`${service.name} ${service.category}`)
  ) {
    target = "track";
  }
  const refill = refillSpec(service);
  const avgTime = formatAverageTimeBilingual(service.averageTime, "en");

  return {
    platform,
    platformLabel: platformMeta.label,
    target,
    targetLabel: TARGET_LABELS[target],
    placeholder: placeholderFor(platform, target),
    example: placeholderFor(platform, target),
    instructions: instructionsFor(platform, target),
    checklist: checklistFor(platform, target, service),
    refill: refill.label,
    refillDetail: refill.detail,
    cancel: service.cancel
      ? b("Cancellation supported", "يدعم الإلغاء")
      : b("No cancellation", "لا يدعم الإلغاء"),
    cancelDetail: service.cancel
      ? b(
          "You can request cancellation while the order is active. The refund is credited after the provider confirms.",
          "يمكنك طلب الإلغاء أثناء نشاط الطلب. يُضاف المبلغ المسترد بعد تأكيد المزود."
        )
      : b(
          "This service cannot be canceled after submission.",
          "لا يمكن إلغاء هذه الخدمة بعد إرسال الطلب."
        ),
    dripfeed: service.dripfeed
      ? b("Drip-feed supported", "يدعم التغذية المرحلية")
      : b("No drip-feed", "لا يدعم التغذية المرحلية"),
    speed: b(
      `Average speed: ${avgTime}`,
      `متوسط السرعة: ${formatAverageTimeBilingual(service.averageTime, "ar")}`
    ),
    pricing: b(
      `${formatCurrency(Number(service.price))} per 1,000 units`,
      `${formatCurrency(Number(service.price))} لكل 1000 وحدة`
    ),
    range: b(
      `Allowed range: ${service.min.toLocaleString("en-IN")}–${service.max.toLocaleString("en-IN")}`,
      `النطاق المسموح: ${service.min.toLocaleString("en-IN")}–${service.max.toLocaleString("en-IN")}`
    ),
    normalizeCta: b("Use full profile URL", "استخدام رابط الملف الكامل"),
  };
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function platformForHost(hostname: string): PlatformKey | null {
  const host = normalizeHost(hostname);

  for (const [platform, hosts] of Object.entries(PLATFORM_HOSTS) as Array<
    [PlatformKey, string[]]
  >) {
    if (hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))) {
      return platform;
    }
  }

  return null;
}

function isBareUsername(value: string): boolean {
  return /^@?[A-Za-z0-9._-]{2,64}$/.test(value);
}

export function normalizeProfileInput(
  platform: PlatformKey,
  raw: string
): string | null {
  const value = raw.trim().replace(/^@/, "");

  if (!isBareUsername(value)) return null;

  const encoded = encodeURIComponent(value);

  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${encoded}`;
    case "tiktok":
      return `https://www.tiktok.com/@${encoded}`;
    case "youtube":
      return `https://www.youtube.com/@${encoded}`;
    case "twitter":
      return `https://x.com/${encoded}`;
    case "facebook":
      return `https://www.facebook.com/${encoded}`;
    case "telegram":
      return `https://t.me/${encoded}`;
    case "snapchat":
      return `https://www.snapchat.com/add/${encoded}`;
    case "linkedin":
      return `https://www.linkedin.com/in/${encoded}`;
    default:
      return null;
  }
}

function instagramPathKind(pathname: string): "profile" | "post" | "story" | "live" | "other" {
  const path = pathname.replace(/\/+$/, "");

  if (/^\/stories\//i.test(path)) return "story";
  if (/^\/live\//i.test(path)) return "live";
  if (/^\/(p|reel|reels|tv|share)\//i.test(path)) return "post";
  if (/^\/[A-Za-z0-9._]+\/?$/i.test(path) && !/^\/(p|reel|stories|explore|accounts|direct)$/i.test(path)) {
    return "profile";
  }

  return "other";
}

function tiktokPathKind(pathname: string): "profile" | "post" | "other" {
  const path = pathname.replace(/\/+$/, "");
  if (/^\/@[^/]+\/video\/\d+/i.test(path)) return "post";
  if (/^\/@[^/]+\/?$/i.test(path)) return "profile";
  return "other";
}

function youtubePathKind(pathname: string, search: string): "profile" | "post" | "other" {
  const path = pathname.replace(/\/+$/, "");

  if (/^\/(watch|shorts|live|embed)\b/i.test(path) || search.includes("v=")) {
    return "post";
  }

  if (/^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/i.test(path)) {
    return "profile";
  }

  return "other";
}

function profilePathKind(platform: PlatformKey, pathname: string): "profile" | "post" | "other" {
  const path = pathname.replace(/\/+$/, "");

  switch (platform) {
    case "twitter":
      if (/\/status\/\d+/i.test(path)) return "post";
      if (/^\/[A-Za-z0-9_]+\/?$/i.test(path)) return "profile";
      return "other";
    case "facebook":
      if (POST_URL_PATTERN.test(path)) return "post";
      if (/^\/(profile\.php|[A-Za-z0-9._-]+)\/?$/i.test(path)) return "profile";
      return "other";
    case "telegram": {
      const parts = path.split("/").filter(Boolean);
      if (parts.length === 1) return "profile";
      if (parts.length === 2) return "post";
      return "other";
    }
    case "linkedin":
      if (/^\/posts\//i.test(path)) return "post";
      if (/^\/(in|company)\/[^/]+/i.test(path)) return "profile";
      return "other";
    default:
      return "other";
  }
}

export function validateServiceLink(
  raw: string,
  service: GuidableService
): ServiceLinkValidation {
  const link = raw.trim();

  if (!link) return {};

  const guidance = getServiceGuidance(service);
  const platform = guidance.platform;
  const target = guidance.target;

  if (target === "website") return {};

  const normalized = normalizeProfileInput(platform, link);

  if (normalized && (target === "profile" || target === "story")) {
    return { normalized };
  }

  if (isBareUsername(link) && target === "post") {
    return {
      issue: "post-profile",
      error: b(
        "Warning: This service requires a specific post, reel, or video link, but you entered a profile name. Please paste the exact content link.",
        "تنبيه: هذه الخدمة تتطلب رابط منشور أو ريلز أو فيديو محدد، بينما أدخلت اسم ملف شخصي. يرجى لصق رابط المحتوى المطلوب."
      ),
    };
  }

  if (isBareUsername(link)) {
    return {};
  }

  let url: URL;

  try {
    url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
  } catch {
    return {
      issue: "invalid",
      error: b("Enter a valid link.", "أدخل رابطًا صالحًا."),
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      issue: "invalid",
      error: b(
        "Only http:// and https:// links are accepted.",
        "يُقبل فقط روابط http:// و https://."
      ),
    };
  }

  const hostPlatform = platformForHost(url.hostname);

  if (
    hostPlatform &&
    platform !== "other" &&
    platform !== "website" &&
    hostPlatform !== platform
  ) {
    return {
      issue: "platform",
      error: b(
        `This link belongs to ${PLATFORM_NAMES[hostPlatform].en}, but the selected service is ${PLATFORM_NAMES[platform].en}.`,
        `هذا الرابط يخص ${PLATFORM_NAMES[hostPlatform].ar}، لكن الخدمة المحددة هي ${PLATFORM_NAMES[platform].ar}.`
      ),
    };
  }

  const pathname = url.pathname;
  const search = url.search.toLowerCase();

  let pathKind: "profile" | "post" | "story" | "live" | "other" = "other";

  if (platform === "instagram") {
    pathKind = instagramPathKind(pathname);
  } else if (platform === "tiktok") {
    pathKind = tiktokPathKind(pathname);
  } else if (platform === "youtube") {
    pathKind = youtubePathKind(pathname, search);
  } else if (platform === "spotify") {
    pathKind = /^\/(track|album|playlist|artist)\//i.test(pathname)
      ? "post"
      : "other";
  } else if (platform === "discord" || platform === "whatsapp" || platform === "snapchat") {
    pathKind = "profile";
  } else {
    pathKind = profilePathKind(platform, pathname);
  }

  if (target === "profile" && pathKind === "post") {
    return {
      issue: "profile-post",
      error: b(
        "Warning: This is an account followers service, but you entered a post/video link. Please enter the profile URL.",
        "تنبيه: هذه خدمة متابعين للحساب، بينما الرابط المدخل هو رابط منشور/فيديو. يرجى وضع رابط الملف الشخصي."
      ),
    };
  }

  if (target === "post" && pathKind === "profile") {
    return {
      issue: "post-profile",
      error: b(
        "Warning: This service requires a specific post, reel, or video link, but you entered a profile URL. Please paste the exact content link.",
        "تنبيه: هذه الخدمة تتطلب رابط منشور أو ريلز أو فيديو محدد، بينما أدخلت رابط الملف الشخصي. يرجى لصق رابط المحتوى المطلوب."
      ),
    };
  }

  if (target === "post" && (pathKind === "story" || pathKind === "live")) {
    return {
      issue: "post-profile",
      error: b(
        "This service requires a post or video link, not a story or live link.",
        "هذه الخدمة تتطلب رابط منشور أو فيديو، وليس رابط ستوري أو بث مباشر."
      ),
    };
  }

  if (target === "story" && pathKind === "live") {
    return {
      issue: "story-link",
      error: b(
        "This service is for story views. Paste the story URL or the profile URL while the story is active.",
        "هذه الخدمة لمشاهدات الستوري. الصق رابط الستوري أو رابط الملف الشخصي أثناء نشاط الستوري."
      ),
    };
  }

  if (target === "live" && pathKind === "story") {
    return {
      issue: "live-link",
      error: b(
        "This service is for a live stream. Paste the live stream URL while it is running.",
        "هذه الخدمة للبث المباشر. الصق رابط البث أثناء تشغيله."
      ),
    };
  }

  if (target === "story" && pathKind === "post") {
    return {
      issue: "story-link",
      error: b(
        "This service is for story views. Paste the story URL or the profile URL while the story is active.",
        "هذه الخدمة لمشاهدات الستوري. الصق رابط الستوري أو رابط الملف الشخصي أثناء نشاط الستوري."
      ),
    };
  }

  if (target === "live" && pathKind === "post" && platform !== "youtube") {
    return {
      issue: "live-link",
      error: b(
        "This service is for a live stream. Paste the live stream URL while it is running.",
        "هذه الخدمة للبث المباشر. الصق رابط البث أثناء تشغيله."
      ),
    };
  }

  if (
    target !== "story" &&
    target !== "live" &&
    POST_URL_PATTERN.test(pathname) &&
    target === "profile"
  ) {
    return {
      issue: "profile-post",
      error: b(
        "Warning: This is an account followers service, but you entered a post/video link. Please enter the profile URL.",
        "تنبيه: هذه خدمة متابعين للحساب، بينما الرابط المدخل هو رابط منشور/فيديو. يرجى وضع رابط الملف الشخصي."
      ),
    };
  }

  return {};
}

export function guidanceText(value: Bilingual, language: Language): string {
  return pick(value, language);
}

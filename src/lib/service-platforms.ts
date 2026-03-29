export type PlatformKey =
  | "instagram"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "telegram"
  | "twitter"
  | "whatsapp"
  | "snapchat"
  | "spotify"
  | "linkedin"
  | "discord"
  | "website"
  | "other";

export interface PlatformMeta {
  key: PlatformKey;
  label: string;
  accentClass: string;
}

const PLATFORM_RULES: Array<{
  meta: PlatformMeta;
  patterns: RegExp[];
}> = [
  {
    meta: {
      key: "instagram",
      label: "Instagram",
      accentClass: "from-pink-500/20 via-fuchsia-500/10 to-orange-500/15",
    },
    patterns: [/\binstagram\b/i, /\binsta\b/i, /\big\b/i],
  },
  {
    meta: {
      key: "facebook",
      label: "Facebook",
      accentClass: "from-blue-500/20 via-sky-500/10 to-cyan-500/15",
    },
    patterns: [/\bfacebook\b/i, /\bfb\b/i],
  },
  {
    meta: {
      key: "youtube",
      label: "YouTube",
      accentClass: "from-red-500/20 via-rose-500/10 to-orange-500/15",
    },
    patterns: [/\byoutube\b/i, /\byt\b/i],
  },
  {
    meta: {
      key: "tiktok",
      label: "TikTok",
      accentClass: "from-cyan-500/20 via-white/5 to-pink-500/15",
    },
    patterns: [/\btiktok\b/i, /\btik\s*tok\b/i],
  },
  {
    meta: {
      key: "telegram",
      label: "Telegram",
      accentClass: "from-sky-500/20 via-cyan-500/10 to-blue-500/15",
    },
    patterns: [/\btelegram\b/i],
  },
  {
    meta: {
      key: "twitter",
      label: "X / Twitter",
      accentClass: "from-slate-400/20 via-white/5 to-slate-600/15",
    },
    patterns: [/\btwitter\b/i, /\bx\.com\b/i, /\btweet\b/i, /\bretweet\b/i],
  },
  {
    meta: {
      key: "whatsapp",
      label: "WhatsApp",
      accentClass: "from-emerald-500/20 via-green-500/10 to-lime-500/15",
    },
    patterns: [/\bwhatsapp\b/i, /\bwa\b/i],
  },
  {
    meta: {
      key: "snapchat",
      label: "Snapchat",
      accentClass: "from-yellow-400/20 via-amber-400/10 to-orange-500/15",
    },
    patterns: [/\bsnapchat\b/i, /\bsnap\b/i],
  },
  {
    meta: {
      key: "spotify",
      label: "Spotify",
      accentClass: "from-green-500/20 via-emerald-500/10 to-teal-500/15",
    },
    patterns: [/\bspotify\b/i],
  },
  {
    meta: {
      key: "linkedin",
      label: "LinkedIn",
      accentClass: "from-blue-500/20 via-sky-500/10 to-indigo-500/15",
    },
    patterns: [/\blinkedin\b/i],
  },
  {
    meta: {
      key: "discord",
      label: "Discord",
      accentClass: "from-indigo-500/20 via-violet-500/10 to-purple-500/15",
    },
    patterns: [/\bdiscord\b/i],
  },
  {
    meta: {
      key: "website",
      label: "Website Traffic",
      accentClass: "from-amber-500/20 via-orange-500/10 to-rose-500/15",
    },
    patterns: [/\btraffic\b/i, /\bwebsite\b/i, /\bseo\b/i, /\bvisitor(s)?\b/i],
  },
];

const FALLBACK_PLATFORM: PlatformMeta = {
  key: "other",
  label: "Other Services",
  accentClass: "from-slate-500/20 via-slate-400/10 to-slate-700/15",
};

function matchPlatform(value: string): PlatformMeta | null {
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue) {
    return null;
  }

  const matchedRule = PLATFORM_RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(normalizedValue))
  );

  return matchedRule?.meta ?? null;
}

export function getPlatformMetaForService(input: {
  category: string;
  name: string;
}): PlatformMeta {
  return (
    matchPlatform(input.category) ??
    matchPlatform(input.name) ??
    FALLBACK_PLATFORM
  );
}

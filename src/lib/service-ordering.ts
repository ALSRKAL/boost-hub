import type { PlatformKey } from "@/lib/service-platforms";

export interface ServiceLike {
  name: string;
  category: string;
  price: string;
}

export interface ServiceSection<T extends ServiceLike> {
  key: string;
  label: string;
  description: string;
  services: T[];
}

interface ServiceSectionRule {
  key: string;
  label: string;
  description: string;
  patterns: RegExp[];
}

const DEFAULT_SERVICE_SECTION_RULES: ServiceSectionRule[] = [
  {
    key: "followers",
    label: "Followers / Subscribers",
    description: "Top priority for growth-focused buyers.",
    patterns: [
      /\bfollower(s)?\b/i,
      /\bsubscriber(s)?\b/i,
      /\bsub(s)?\b/i,
    ],
  },
  {
    key: "members",
    label: "Members / Joiners",
    description: "Channels, groups, and member-based growth offers.",
    patterns: [/\bmember(s)?\b/i, /\bjoin(er|ers)?\b/i],
  },
  {
    key: "likes",
    label: "Likes / Reactions",
    description: "Fast engagement boosts ranked from cheapest upward.",
    patterns: [/\blike(s)?\b/i, /\breaction(s)?\b/i],
  },
  {
    key: "views",
    label: "Views / Reach",
    description: "View, watch-time, and impression style services.",
    patterns: [
      /\bview(s)?\b/i,
      /\bimpression(s)?\b/i,
      /\breach\b/i,
      /\bwatch\s*time\b/i,
    ],
  },
  {
    key: "comments",
    label: "Comments / Reviews",
    description: "Feedback, review, and comment-driven services.",
    patterns: [/\bcomment(s)?\b/i, /\breview(s)?\b/i],
  },
  {
    key: "shares",
    label: "Shares / Saves",
    description: "Saves, reposts, and virality-style actions.",
    patterns: [/\bshare(s|d)?\b/i, /\bsave(s|d)?\b/i, /\brepost(s|ed)?\b/i],
  },
  {
    key: "story",
    label: "Stories / Live / Polls",
    description: "Short-lived or live interaction service types.",
    patterns: [/\bstor(y|ies)\b/i, /\blive\b/i, /\bpoll(s)?\b/i, /\bvote(s)?\b/i],
  },
];

const INSTAGRAM_SERVICE_SECTION_RULES: ServiceSectionRule[] = [
  {
    key: "followers",
    label: "Followers",
    description: "Profile growth services focused on Instagram followers.",
    patterns: [/\bfollower(s)?\b/i],
  },
  {
    key: "story",
    label: "Stories / Live",
    description: "Story views, story engagement, polls, and live interactions.",
    patterns: [/\bstor(y|ies)\b/i, /\blive\b/i, /\bpoll(s)?\b/i, /\bvote(s)?\b/i],
  },
  {
    key: "reels",
    label: "Reels",
    description: "Reels-focused reach and engagement services.",
    patterns: [/\breel(s)?\b/i],
  },
  {
    key: "posts",
    label: "Posts",
    description: "Feed post, photo, and carousel related offers.",
    patterns: [/\bpost(s)?\b/i, /\bphoto(s)?\b/i, /\bcarousel(s)?\b/i],
  },
  {
    key: "likes",
    label: "Likes / Reactions",
    description: "General Instagram engagement boosts for likes and reactions.",
    patterns: [/\blike(s)?\b/i, /\breaction(s)?\b/i],
  },
  {
    key: "views",
    label: "Views / Reach",
    description: "Views, impressions, plays, and reach style services.",
    patterns: [
      /\bview(s)?\b/i,
      /\bimpression(s)?\b/i,
      /\breach\b/i,
      /\bwatch\s*time\b/i,
      /\bplay(s)?\b/i,
    ],
  },
  {
    key: "comments",
    label: "Comments",
    description: "Comment-driven Instagram services.",
    patterns: [/\bcomment(s)?\b/i],
  },
  {
    key: "shares",
    label: "Shares / Saves",
    description: "Saves, shares, reposts, and similar actions.",
    patterns: [/\bshare(s|d)?\b/i, /\bsave(s|d)?\b/i, /\brepost(s|ed)?\b/i],
  },
];

function getServiceSectionRules(platformKey?: PlatformKey | null): ServiceSectionRule[] {
  if (platformKey === "instagram") {
    return INSTAGRAM_SERVICE_SECTION_RULES;
  }

  return DEFAULT_SERVICE_SECTION_RULES;
}

function getServicePrice(service: ServiceLike): number {
  return Number.parseFloat(service.price) || 0;
}

function matchSectionKey(value: string, rules: ServiceSectionRule[]): string | null {
  const haystack = value.trim().toLowerCase();

  if (!haystack) return null;

  const matchedRule = rules.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(haystack))
  );

  return matchedRule?.key ?? null;
}

function getServiceSectionKey(
  service: ServiceLike,
  rules: ServiceSectionRule[]
): string {
  // The service name is the reliable signal. Category text often contains
  // marketing copy ("Diwali Sale is Live") that would misclassify a Reels or
  // Views service as a Stories/Live service.
  return (
    matchSectionKey(service.name, rules) ??
    matchSectionKey(service.category, rules) ??
    "other"
  );
}

function getSectionPriority(sectionKey: string, rules: ServiceSectionRule[]): number {
  const index = rules.findIndex((rule) => rule.key === sectionKey);
  return index === -1 ? rules.length : index;
}

export function sortServicesByPriorityAndPrice<T extends ServiceLike>(
  services: T[],
  platformKey?: PlatformKey | null
): T[] {
  const rules = getServiceSectionRules(platformKey);

  return [...services].sort((left, right) => {
    const sectionDifference =
      getSectionPriority(getServiceSectionKey(left, rules), rules) -
      getSectionPriority(getServiceSectionKey(right, rules), rules);

    if (sectionDifference !== 0) {
      return sectionDifference;
    }

    const priceDifference = getServicePrice(left) - getServicePrice(right);

    if (priceDifference !== 0) {
      return priceDifference;
    }

    return left.name.localeCompare(right.name);
  });
}

export function getServiceSections<T extends ServiceLike>(
  services: T[],
  platformKey?: PlatformKey | null
): ServiceSection<T>[] {
  const rules = getServiceSectionRules(platformKey);
  const buckets = new Map<string, T[]>();

  for (const service of services) {
    const bucketKey = getServiceSectionKey(service, rules);
    const existing = buckets.get(bucketKey) ?? [];
    existing.push(service);
    buckets.set(bucketKey, existing);
  }

  const orderedSections: ServiceSection<T>[] = [];

  for (const rule of rules) {
    const sectionServices = buckets.get(rule.key);

    if (!sectionServices || sectionServices.length === 0) {
      continue;
    }

    orderedSections.push({
      key: rule.key,
      label: rule.label,
      description: rule.description,
      services: sortServicesByPriorityAndPrice(sectionServices, platformKey),
    });
  }

  const otherServices = buckets.get("other");

  if (otherServices && otherServices.length > 0) {
    orderedSections.push({
      key: "other",
      label: "Other Services",
      description: "Everything else that does not fit the core demand buckets.",
      services: sortServicesByPriorityAndPrice(otherServices, platformKey),
    });
  }

  return orderedSections;
}

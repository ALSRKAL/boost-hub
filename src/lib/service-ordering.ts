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

const SERVICE_SECTION_RULES = [
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
    patterns: [/\bstory\b/i, /\blive\b/i, /\bpoll(s)?\b/i, /\bvote(s)?\b/i],
  },
];

function getServicePrice(service: ServiceLike): number {
  return Number.parseFloat(service.price) || 0;
}

function getServiceSectionKey(service: ServiceLike): string {
  const haystack = `${service.name} ${service.category}`.toLowerCase();
  const matchedRule = SERVICE_SECTION_RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(haystack))
  );

  return matchedRule?.key ?? "other";
}

function getSectionPriority(sectionKey: string): number {
  const index = SERVICE_SECTION_RULES.findIndex((rule) => rule.key === sectionKey);
  return index === -1 ? SERVICE_SECTION_RULES.length : index;
}

export function sortServicesByPriorityAndPrice<T extends ServiceLike>(
  services: T[]
): T[] {
  return [...services].sort((left, right) => {
    const sectionDifference =
      getSectionPriority(getServiceSectionKey(left)) -
      getSectionPriority(getServiceSectionKey(right));

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
  services: T[]
): ServiceSection<T>[] {
  const buckets = new Map<string, T[]>();

  for (const service of services) {
    const bucketKey = getServiceSectionKey(service);
    const existing = buckets.get(bucketKey) ?? [];
    existing.push(service);
    buckets.set(bucketKey, existing);
  }

  const orderedSections: ServiceSection<T>[] = [];

  for (const rule of SERVICE_SECTION_RULES) {
    const sectionServices = buckets.get(rule.key);

    if (!sectionServices || sectionServices.length === 0) {
      continue;
    }

    orderedSections.push({
      key: rule.key,
      label: rule.label,
      description: rule.description,
      services: sortServicesByPriorityAndPrice(sectionServices),
    });
  }

  const otherServices = buckets.get("other");

  if (otherServices && otherServices.length > 0) {
    orderedSections.push({
      key: "other",
      label: "Other Services",
      description: "Everything else that does not fit the core demand buckets.",
      services: sortServicesByPriorityAndPrice(otherServices),
    });
  }

  return orderedSections;
}

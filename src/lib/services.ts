import type { PlatformKey, PlatformMeta } from "@/lib/service-platforms";
import { getPlatformMetaForService } from "@/lib/service-platforms";
import { sortServicesByPriorityAndPrice } from "@/lib/service-ordering";

export interface ServiceItem {
  id: string;
  name: string;
  category: string;
  price: string;
  min: number;
  max: number;
  type: string;
  refill: boolean;
  cancel: boolean;
  dripfeed: boolean;
  averageTime: string | null;
}

export interface PlatformGroup {
  platform: PlatformMeta;
  services: ServiceItem[];
}

const PLATFORM_ORDER: PlatformKey[] = [
  "instagram",
  "tiktok",
  "youtube",
  "twitter",
  "facebook",
  "telegram",
  "whatsapp",
  "spotify",
  "snapchat",
  "linkedin",
  "discord",
  "website",
  "other",
];

/**
 * Only services whose provider type is "Custom Comments" accept a comment
 * list. A name containing "comments" is not enough: most comment services are
 * random/auto comments handled by the provider.
 */
export function isCustomCommentsService(type: string | null | undefined): boolean {
  if (!type) return false;
  return /custom[\s_-]*comments?/i.test(type);
}

export function getServicePrice(service: Pick<ServiceItem, "price">): number {
  const price = Number.parseFloat(service.price);
  return Number.isFinite(price) ? price : 0;
}

export function groupServicesByPlatform(services: ServiceItem[]): PlatformGroup[] {
  const groups = new Map<PlatformKey, PlatformGroup>();

  for (const service of services) {
    const platform = getPlatformMetaForService(service);
    const existing = groups.get(platform.key);

    if (existing) {
      existing.services.push(service);
    } else {
      groups.set(platform.key, { platform, services: [service] });
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      services: sortServicesByPriorityAndPrice(group.services, group.platform.key),
    }))
    .sort((left, right) => {
      const leftIndex = PLATFORM_ORDER.indexOf(left.platform.key);
      const rightIndex = PLATFORM_ORDER.indexOf(right.platform.key);

      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return left.platform.label.localeCompare(right.platform.label);
    });
}

export function searchServices(services: ServiceItem[], query: string): ServiceItem[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) return services;

  return services.filter((service) => {
    const platform = getPlatformMetaForService(service).label;
    return [
      service.id,
      service.name,
      service.category,
      service.type,
      platform,
    ].some((value) => value.toLowerCase().includes(normalized));
  });
}

export function minServicePrice(services: ServiceItem[]): number | null {
  if (services.length === 0) return null;

  return services.reduce((lowest, service) => {
    const price = getServicePrice(service);
    return price > 0 && price < lowest ? price : lowest;
  }, Number.POSITIVE_INFINITY);
}

"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import PlatformIcon from "@/components/ui/PlatformIcon";
import Icon from "@/components/ui/Icon";
import SearchInput from "@/components/ui/SearchInput";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonRows,
} from "@/components/ui/Primitives";
import { formatCurrency, formatNumber } from "@/lib/constants";
import { formatAverageTimeBilingual } from "@/lib/i18n";
import {
  getServicePrice,
  groupServicesByPlatform,
  minServicePrice,
  searchServices,
  type PlatformGroup,
  type ServiceItem,
} from "@/lib/services";
import { getServiceGuidance } from "@/lib/service-guidance";
import type { PlatformKey } from "@/lib/service-platforms";
import { getServiceSections } from "@/lib/service-ordering";

type PlatformFilter = PlatformKey | "all";

export default function ServicesPage() {
  const { t } = useLanguage();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter | null>(null);

  const deferredSearch = useDeferredValue(search);
  const query = deferredSearch.trim();

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/services", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof payload === "object" && payload !== null && "error" in payload
              ? String(payload.error)
              : "The catalog could not be loaded.";
          throw new Error(message);
        }

        if (!Array.isArray(payload)) {
          throw new Error("Unexpected catalog response.");
        }

        setServices(payload as ServiceItem[]);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Failed to load services:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The catalog could not be loaded."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [reloadKey]);

  const groups = useMemo(() => groupServicesByPlatform(services), [services]);
  const searched = useMemo(() => searchServices(services, query), [services, query]);

  const counts = useMemo(() => {
    const byPlatform = Object.fromEntries(
      groups.map((group) => [group.platform.key, group.services.length])
    ) as Record<string, number>;

    return { all: services.length, byPlatform };
  }, [groups, services.length]);

  const effectiveFilter: PlatformFilter = useMemo(() => {
    // An active search is global; clearing it restores the last platform.
    if (query) return "all";
    if (platformFilter) return platformFilter;
    return groups[0]?.platform.key ?? "all";
  }, [query, platformFilter, groups]);

  const visibleGroups = useMemo<PlatformGroup[]>(() => {
    const searchedGroups = groupServicesByPlatform(searched);

    return searchedGroups.filter(
      (group) => effectiveFilter === "all" || group.platform.key === effectiveFilter
    );
  }, [searched, effectiveFilter]);

  const visibleCount = visibleGroups.reduce(
    (total, group) => total + group.services.length,
    0
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t("Catalog", "الكتالوج")}
        title={t("Services", "الخدمات")}
        description={t(
          "Provider rate plus the panel margin, shown per 1,000 units. Refill and cancel flags come from the provider.",
          "سعر المزود مع هامش اللوحة، معروض لكل 1000 وحدة. خيارات التعويض والإلغاء تأتي من المزود."
        )}
        actions={
          <span className="num-sm text-ink-mute">
            {t(
              `${formatNumber(visibleCount)} of ${formatNumber(
                counts.all
              )} services`,
              `${formatNumber(visibleCount)} من ${formatNumber(
                counts.all
              )} خدمة`
            )}
          </span>
        }
      />

      <div className="sticky top-14 z-20 -mx-4 border-b border-line bg-canvas px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
        <div className="space-y-3">
          <SearchInput
            label={t("Search services", "بحث في الخدمات")}
            value={search}
            onChange={setSearch}
            placeholder={t(
              "Search by service name, ID, category, or platform",
              "ابحث باسم الخدمة أو المعرف أو القسم أو المنصة"
            )}
          />

          <div className="scroll-x scrollbar-none flex items-center gap-1.5 pb-0.5">
            <button
              type="button"
              className="chip"
              aria-pressed={effectiveFilter === "all"}
              onClick={() => {
                setPlatformFilter("all");
                setSearch("");
              }}
            >
              {t("All platforms", "كل المنصات")}
              <span className="chip-count">{formatNumber(counts.all)}</span>
            </button>
            {groups.map((group) => (
              <button
                key={group.platform.key}
                type="button"
                className="chip"
                aria-pressed={effectiveFilter === group.platform.key}
                onClick={() => {
                  setPlatformFilter(group.platform.key);
                  setSearch("");
                }}
              >
                <PlatformIcon platform={group.platform.key} className="h-3.5 w-3.5" />
                {group.platform.label}
                <span className="chip-count">
                  {formatNumber(counts.byPlatform[group.platform.key] ?? 0)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={8} />
      ) : error ? (
        <ErrorState
          title={t("Catalog unavailable", "الكتالوج غير متاح")}
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : visibleGroups.length === 0 ? (
        <EmptyState
          icon="search"
          title={
            query
              ? t("No matching services", "لا توجد خدمات مطابقة")
              : t("No services available", "لا توجد خدمات متاحة")
          }
          description={
            query
              ? t(
                  "Try a shorter keyword, a service ID, or a different platform.",
                  "جرّب كلمة أقصر أو معرف خدمة أو منصة أخرى."
                )
              : t(
                  "The provider returned an empty catalog. Try again in a moment.",
                  "أعاد المزود كتالوجًا فارغًا. حاول بعد قليل."
                )
          }
          action={
            query ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSearch("")}
              >
                {t("Clear search", "مسح البحث")}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <PlatformSection
              key={group.platform.key}
              group={group}
              expandAll={query.length > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlatformSection({
  group,
  expandAll,
}: {
  group: PlatformGroup;
  expandAll: boolean;
}) {
  const { t } = useLanguage();
  const sections = getServiceSections(group.services, group.platform.key);
  const from = minServicePrice(group.services);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const limit = 25;

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-line bg-subtle text-ink-soft">
            <PlatformIcon platform={group.platform.key} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold text-ink">
              {group.platform.label}
            </h2>
            <p className="text-[11.5px] text-ink-mute">
              {t(
                `${formatNumber(group.services.length)} services · ${
                  sections.length
                } ${sections.length === 1 ? "section" : "sections"}`,
                `${formatNumber(group.services.length)} خدمة · ${
                  sections.length
                } قسم`
              )}
            </p>
          </div>
        </div>
        {from !== null && from !== Number.POSITIVE_INFINITY ? (
          <p className="text-[11.5px] text-ink-mute">
            {t("From", "من")}{" "}
            <span className="num-sm font-medium text-ink">{formatCurrency(from)}</span>{" "}
            {t("/ 1k", "/ 1000")}
          </p>
        ) : null}
      </header>

      {sections.map((section) => {
        const expanded =
          expandAll || expandedSections.includes(section.key);
        const visibleServices = expanded
          ? section.services
          : section.services.slice(0, limit);
        const hiddenCount = section.services.length - visibleServices.length;

        return (
        <div key={section.key} className="border-b border-line last:border-b-0">
          <div className="flex items-center justify-between gap-3 bg-subtle px-4 py-2">
            <h3 className="text-[12px] font-semibold text-ink">{section.label}</h3>
            <span className="num-sm text-[11px] text-ink-mute">
              {formatNumber(section.services.length)}
            </span>
          </div>

          <div className="scroll-x hidden md:block">
            <table className="data-table min-w-[860px]">
              <thead>
                <tr>
                  <th className="w-16">{t("ID", "المعرف")}</th>
                  <th>{t("Service", "الخدمة")}</th>
                  <th>{t("Avg. time", "متوسط الوقت")}</th>
                  <th className="cell-end">{t("Min / Max", "الأدنى / الأقصى")}</th>
                  <th className="cell-end">{t("Rate / 1k", "السعر / 1000")}</th>
                  <th className="text-center">{t("Refill", "تعويض")}</th>
                  <th className="text-center">{t("Cancel", "إلغاء")}</th>
                  <th className="cell-end">{t("Action", "إجراء")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleServices.map((service) => (
                  <ServiceRow key={service.id} service={service} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-line md:hidden">
            {visibleServices.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>

          {hiddenCount > 0 || (!expandAll && expanded) ? (
            <div className="flex items-center justify-between gap-3 border-t border-line bg-subtle px-4 py-2">
              <span className="text-[11.5px] text-ink-mute">
                {expanded
                  ? t(
                      `${formatNumber(section.services.length)} shown`,
                      `${formatNumber(section.services.length)} معروضة`
                    )
                  : t(
                      `${formatNumber(hiddenCount)} more in this section`,
                      `${formatNumber(hiddenCount)} إضافية في هذا القسم`
                    )}
              </span>
              <button
                type="button"
                className="text-[11.5px] font-medium text-accent hover:underline"
                onClick={() =>
                  setExpandedSections((current) =>
                    current.includes(section.key)
                      ? current.filter((key) => key !== section.key)
                      : [...current, section.key]
                  )
                }
              >
                {expanded
                  ? t("Show fewer", "عرض أقل")
                  : t(
                      `Show all ${formatNumber(section.services.length)}`,
                      `عرض كل ${formatNumber(section.services.length)}`
                    )}
              </button>
            </div>
          ) : null}
        </div>
        );
      })}
    </section>
  );
}

function ServiceRow({ service }: { service: ServiceItem }) {
  const { language, t, pick } = useLanguage();
  const guide = getServiceGuidance(service);

  return (
    <tr>
      <td>
        <span className="num-sm text-ink-mute">#{service.id}</span>
      </td>
      <td>
        <p className="cell-strong max-w-[420px] leading-5">{service.name}</p>
        <p className="mt-0.5 text-[11.5px] text-ink-mute">{service.category}</p>
        <p className="mt-0.5 max-w-[420px] truncate text-[10.5px] text-ink-mute">
          {pick(guide.targetLabel)} ·{" "}
          <span dir="ltr" className="font-mono">
            {pick(guide.example)}
          </span>
        </p>
      </td>
      <td className="whitespace-nowrap text-[12px]">
        {formatAverageTimeBilingual(service.averageTime, language)}
      </td>
      <td className="cell-end num-sm whitespace-nowrap">
        {formatNumber(service.min)} / {formatNumber(service.max)}
      </td>
      <td className="cell-end">
        <span className="num-sm font-semibold text-ink">
          {formatCurrency(getServicePrice(service))}
        </span>
      </td>
      <td className="text-center">
        {service.refill ? (
          <span className="text-[11.5px] font-medium text-positive">
            {t("Yes", "نعم")}
          </span>
        ) : (
          <span className="text-[11.5px] text-ink-mute">—</span>
        )}
      </td>
      <td className="text-center">
        {service.cancel ? (
          <span className="text-[11.5px] font-medium text-ink-soft">
            {t("Yes", "نعم")}
          </span>
        ) : (
          <span className="text-[11.5px] text-ink-mute">—</span>
        )}
      </td>
      <td className="cell-end">
        <Link
          href={`/new-order?service=${service.id}`}
          className="btn btn-secondary btn-sm"
        >
          {t("Order", "اطلب")}
        </Link>
      </td>
    </tr>
  );
}

function ServiceCard({ service }: { service: ServiceItem }) {
  const { language, t, pick } = useLanguage();
  const guide = getServiceGuidance(service);

  return (
    <div className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="num-sm text-[11px] text-ink-mute">#{service.id}</p>
          <p className="mt-1 text-[13px] font-medium leading-5 text-ink">
            {service.name}
          </p>
          <p className="mt-0.5 text-[11.5px] text-ink-mute">{service.category}</p>
          <p className="mt-0.5 line-clamp-1 text-[10.5px] text-ink-mute">
            {pick(guide.targetLabel)} ·{" "}
            <span dir="ltr" className="font-mono">
              {pick(guide.example)}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="num-sm font-semibold text-ink">
            {formatCurrency(getServicePrice(service))}
          </p>
          <p className="text-[10.5px] text-ink-mute">{t("per 1k", "لكل 1000")}</p>
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px]">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-mute">{t("Range", "النطاق")}</dt>
          <dd className="num-sm text-ink">
            {formatNumber(service.min)}–{formatNumber(service.max)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-mute">{t("Time", "الوقت")}</dt>
          <dd className="truncate text-ink">
            {formatAverageTimeBilingual(service.averageTime, language)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-mute">{t("Refill", "تعويض")}</dt>
          <dd className={service.refill ? "text-positive" : "text-ink-mute"}>
            {service.refill ? t("Yes", "نعم") : t("No", "لا")}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-mute">{t("Cancel", "إلغاء")}</dt>
          <dd className="text-ink-soft">
            {service.cancel ? t("Yes", "نعم") : t("No", "لا")}
          </dd>
        </div>
      </dl>

      <Link
        href={`/new-order?service=${service.id}`}
        className="btn btn-secondary btn-sm mt-3 w-full"
      >
        <Icon name="plus" size={13} />
        {t("Order this service", "اطلب هذه الخدمة")}
      </Link>
    </div>
  );
}

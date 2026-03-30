"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PlatformIcon from "@/components/ui/PlatformIcon";
import { APP_CONFIG, formatCurrency } from "@/lib/constants";
import {
  getPlatformMetaForService,
  type PlatformMeta,
} from "@/lib/service-platforms";
import {
  getServiceSections,
  sortServicesByPriorityAndPrice,
  type ServiceSection,
} from "@/lib/service-ordering";

interface ServiceItem {
  id: string;
  name: string;
  category: string;
  price: string;
  min: number;
  max: number;
  type: string;
}

interface PlatformGroup {
  platform: PlatformMeta;
  services: ServiceItem[];
}

function getServicePrice(service: ServiceItem): number {
  return Number.parseFloat(service.price) || 0;
}

function groupServicesByPlatform(services: ServiceItem[]): PlatformGroup[] {
  const groups = new Map<string, PlatformGroup>();

  for (const service of services) {
    const platform = getPlatformMetaForService(service);
    const existing = groups.get(platform.key);

    if (existing) {
      existing.services.push(service);
      continue;
    }

    groups.set(platform.key, {
      platform,
      services: [service],
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      platform: group.platform,
      services: sortServicesByPriorityAndPrice(group.services),
    }))
    .sort((a, b) => a.platform.label.localeCompare(b.platform.label));
}

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [openPlatforms, setOpenPlatforms] = useState<string[]>([]);

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase();

  useEffect(() => {
    const controller = new AbortController();

    async function loadServices() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/services", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        const payload: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "Failed to load services.";
          throw new Error(message);
        }

        if (!Array.isArray(payload)) {
          throw new Error("Unexpected services response.");
        }

        const nextServices = payload as ServiceItem[];
        setServices(nextServices);

        if (nextServices.length > 0) {
          const firstPlatform = groupServicesByPlatform(nextServices)[0]?.platform.key;
          setOpenPlatforms((current) =>
            current.length > 0 || !firstPlatform ? current : [firstPlatform]
          );
        }
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch services:", fetchError);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load services."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadServices();

    return () => controller.abort();
  }, []);

  const visibleServices = useMemo(
    () =>
      normalizedSearchTerm
        ? services.filter((service) => {
            const platform = getPlatformMetaForService(service);
            return (
              service.name.toLowerCase().includes(normalizedSearchTerm) ||
              service.category.toLowerCase().includes(normalizedSearchTerm) ||
              platform.label.toLowerCase().includes(normalizedSearchTerm)
            );
          })
        : services,
    [normalizedSearchTerm, services]
  );

  const groupedServices = useMemo(
    () => groupServicesByPlatform(visibleServices),
    [visibleServices]
  );

  const effectiveOpenPlatforms =
    normalizedSearchTerm.length > 0
      ? groupedServices.map((group) => group.platform.key)
      : openPlatforms;

  function togglePlatform(platformKey: string) {
    setOpenPlatforms((current) =>
      current.includes(platformKey)
        ? current.filter((item) => item !== platformKey)
        : [...current, platformKey]
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
          Curated Catalog
        </div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] lg:text-3xl">
          Services
        </h1>
        <p className="max-w-3xl text-sm text-[var(--color-text-muted)]">
          Inside every platform, services are now split intelligently by importance.
          Followers and subscribers appear first, and each section starts from the
          cheapest offer upward.
        </p>
      </section>

      <section className="sticky top-20 z-20">
        <div className="glass-card rounded-3xl border border-[var(--color-border)] px-4 py-4 shadow-2xl shadow-black/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by service name, provider category, or platform..."
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-3 pl-12 pr-4 text-sm text-[var(--color-text-primary)] outline-none transition-all duration-200 placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <SummaryPill label="Platforms" value={String(groupedServices.length)} />
              <SummaryPill label="Services" value={String(visibleServices.length)} />
              <SummaryPill label="Currency" value={APP_CONFIG.currency.code} />
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <ServicesSkeleton />
      ) : error ? (
        <ErrorState message={error} />
      ) : groupedServices.length === 0 ? (
        <EmptyState hasSearch={normalizedSearchTerm.length > 0} />
      ) : (
        <section className="space-y-4">
          {groupedServices.map((group) => {
            const isOpen = effectiveOpenPlatforms.includes(group.platform.key);
            const lowestPrice = group.services[0]
              ? formatCurrency(getServicePrice(group.services[0]))
              : "—";
            const sections = getServiceSections(group.services);

            return (
              <div
                key={group.platform.key}
                className="glass-card overflow-hidden rounded-3xl border border-[var(--color-border)]"
              >
                <button
                  type="button"
                  onClick={() => togglePlatform(group.platform.key)}
                  className={`flex w-full items-center justify-between gap-4 bg-gradient-to-r px-5 py-5 text-left transition-colors duration-200 hover:bg-[var(--color-bg-tertiary)]/35 ${group.platform.accentClass}`}
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/15 text-[var(--color-text-primary)]">
                        <PlatformIcon platform={group.platform.key} className="h-6 w-6" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                          {group.platform.label}
                        </h2>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {group.services.length} services across {sections.length} smart sections
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                        Starts at {lowestPrice}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Followers and subscribers are shown first, then the rest by demand
                      priority and price.
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 text-[var(--color-text-secondary)] transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </button>

                {isOpen ? <ServicesSections sections={sections} /> : null}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
        {value}
      </p>
    </div>
  );
}

function ServicesSections({
  sections,
}: {
  sections: ServiceSection<ServiceItem>[];
}) {
  return (
    <div className="border-t border-[var(--color-border)]">
      {sections.map((section, index) => (
        <div
          key={section.key}
          className={index === 0 ? "" : "border-t border-[var(--color-border)]/70"}
        >
          <div className="bg-[var(--color-bg-tertiary)]/35 px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                {section.label}
              </h3>
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                {section.services.length} offers
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {section.description}
            </p>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="bg-black/5">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                    ID
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                    Service
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                    Provider Category
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                    Min / Max
                  </th>
                  <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                    Our Price
                  </th>
                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {section.services.map((service, rowIndex) => (
                  <tr
                    key={service.id}
                    className={`border-t border-[var(--color-border)]/60 ${
                      rowIndex % 2 === 0 ? "bg-black/5" : "bg-transparent"
                    }`}
                  >
                    <td className="px-5 py-4 align-top text-sm text-[var(--color-text-secondary)]">
                      #{service.id}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {service.name}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Sorted from the cheapest to the most expensive in this section.
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[var(--color-text-secondary)]">
                      {service.category}
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[var(--color-text-secondary)]">
                      {service.min.toLocaleString("en-IN")} /{" "}
                      {service.max.toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-4 text-right align-top">
                      <div className="space-y-1">
                        <p className="text-lg font-bold text-emerald-300">
                          {formatCurrency(getServicePrice(service))}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          per 1000 units
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center align-middle">
                      <Link
                        href={`/new-order?service=${service.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-2 text-xs font-semibold text-[var(--color-accent)] transition-all duration-200 hover:bg-[var(--color-accent)]/20 hover:border-[var(--color-accent)]/50 active:scale-95"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                        </svg>
                        Order
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 lg:hidden">
            {section.services.map((service) => (
              <article
                key={service.id}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                      #{service.id}
                    </p>
                    <h4 className="mt-1 text-base font-semibold text-[var(--color-text-primary)]">
                      {service.name}
                    </h4>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {service.category}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-emerald-300">
                      {formatCurrency(getServicePrice(service))}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">per 1000</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <MetaTile label="Type" value={service.type || "Default"} />
                  <MetaTile
                    label="Min / Max"
                    value={`${service.min.toLocaleString("en-IN")} / ${service.max.toLocaleString("en-IN")}`}
                  />
                </div>

                <Link
                  href={`/new-order?service=${service.id}`}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 py-2.5 text-sm font-semibold text-[var(--color-accent)] transition-all duration-200 hover:bg-[var(--color-accent)]/20 active:scale-[0.98]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                  </svg>
                  Order Now
                </Link>
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-black/10 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
        {value}
      </p>
    </div>
  );
}

function ServicesSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="glass-card rounded-3xl border border-[var(--color-border)] p-5"
        >
          <div className="animate-pulse space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-white/10" />
                <div className="space-y-2">
                  <div className="h-5 w-40 rounded-full bg-white/10" />
                  <div className="h-4 w-52 rounded-full bg-white/5" />
                </div>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-white/10" />
            </div>
            <div className="space-y-3">
              <div className="h-16 rounded-2xl bg-white/5" />
              <div className="h-20 rounded-2xl bg-white/5" />
              <div className="h-20 rounded-2xl bg-white/5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="glass-card rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-center">
      <h2 className="text-lg font-semibold text-red-300">Unable to load services</h2>
      <p className="mt-2 text-sm text-red-200/80">{message}</p>
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="glass-card rounded-3xl border border-[var(--color-border)] p-8 text-center">
      <p className="text-lg font-semibold text-[var(--color-text-primary)]">
        {hasSearch ? "No services match your search" : "No services available"}
      </p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {hasSearch
          ? "Try a different keyword or clear the search to view the full catalog."
          : "The provider did not return any services right now."}
      </p>
    </div>
  );
}

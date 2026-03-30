"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Toast, { useToast } from "@/components/ui/Toast";
import PlatformIcon from "@/components/ui/PlatformIcon";
import { formatCurrency } from "@/lib/constants";
import {
  getPlatformMetaForService,
  type PlatformMeta,
} from "@/lib/service-platforms";
import { sortServicesByPriorityAndPrice } from "@/lib/service-ordering";

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
  const platformMap = new Map<string, PlatformGroup>();

  for (const service of services) {
    const platform = getPlatformMetaForService(service);
    const existing = platformMap.get(platform.key);

    if (existing) {
      existing.services.push(service);
      continue;
    }

    platformMap.set(platform.key, {
      platform,
      services: [service],
    });
  }

  return Array.from(platformMap.values())
    .map((group) => ({
      platform: group.platform,
      services: sortServicesByPriorityAndPrice(group.services),
    }))
    .sort((a, b) => a.platform.label.localeCompare(b.platform.label));
}

function calculateCharge(service: ServiceItem | null, quantityValue: string): number | null {
  const quantity = Number(quantityValue);

  if (!service || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return Number(((getServicePrice(service) / 1000) * quantity).toFixed(2));
}

function formatServiceOption(service: ServiceItem): string {
  return `${service.name} - ${formatCurrency(getServicePrice(service))}`;
}

export default function NewOrderPage() {
  const { user, userProfile } = useAuth();
  const { toasts, addToast, removeToast } = useToast();
  const searchParams = useSearchParams();
  const preselectedServiceId = searchParams.get("service");

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [selectedPlatformKey, setSelectedPlatformKey] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [serviceError, setServiceError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [quantityError, setQuantityError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadServices() {
      try {
        setLoadingServices(true);
        setServicesError(null);

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
        const platformGroups = groupServicesByPlatform(nextServices);

        // If a service was preselected via URL (?service=ID), find its platform
        let initialPlatform = platformGroups[0];
        let initialService = initialPlatform?.services[0];

        if (preselectedServiceId) {
          for (const group of platformGroups) {
            const found = group.services.find((s) => s.id === preselectedServiceId);
            if (found) {
              initialPlatform = group;
              initialService = found;
              break;
            }
          }
        }

        setServices(nextServices);
        setSelectedPlatformKey(initialPlatform?.platform.key ?? "");
        setSelectedServiceId(initialService?.id ?? "");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load order form services:", error);
        setServicesError(
          error instanceof Error ? error.message : "Failed to load services."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingServices(false);
        }
      }
    }

    loadServices();

    return () => controller.abort();
  }, [preselectedServiceId]);

  const platformGroups = useMemo(() => groupServicesByPlatform(services), [services]);
  const selectedPlatformGroup =
    platformGroups.find((group) => group.platform.key === selectedPlatformKey) ?? null;
  const servicesInPlatform = selectedPlatformGroup?.services ?? [];
  const selectedService =
    servicesInPlatform.find((service) => service.id === selectedServiceId) ?? null;
  const totalCharge = calculateCharge(selectedService, quantity);

  function handlePlatformChange(platformKey: string) {
    const group = platformGroups.find((item) => item.platform.key === platformKey);
    const firstService = group?.services[0];

    setSelectedPlatformKey(platformKey);
    setSelectedServiceId(firstService?.id ?? "");
    setServiceError("");
    setQuantity("");
    setQuantityError("");
  }

  function resetForm() {
    const firstGroup = platformGroups[0];
    const firstService = firstGroup?.services[0];

    setSelectedPlatformKey(firstGroup?.platform.key ?? "");
    setSelectedServiceId(firstService?.id ?? "");
    setLink("");
    setQuantity("");
    setServiceError("");
    setLinkError("");
    setQuantityError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let hasError = false;
    const trimmedLink = link.trim();
    const parsedQuantity = Number(quantity);

    if (!selectedService) {
      setServiceError("Please select a service.");
      hasError = true;
    } else {
      setServiceError("");
    }

    if (!trimmedLink) {
      setLinkError("Link is required.");
      hasError = true;
    } else {
      setLinkError("");
    }

    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setQuantityError("Please enter a valid quantity.");
      hasError = true;
    } else if (
      selectedService &&
      (parsedQuantity < selectedService.min || parsedQuantity > selectedService.max)
    ) {
      setQuantityError(
        `Quantity must be between ${selectedService.min} and ${selectedService.max}.`
      );
      hasError = true;
    } else {
      setQuantityError("");
    }

    if (hasError) return;

    if (!user?.uid) {
      addToast("You must be logged in to place an order.", "error");
      return;
    }

    try {
      setSubmitting(true);

      const token = await user.getIdToken();
      const response = await fetch("/api/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serviceId: selectedServiceId,
          link: trimmedLink,
          quantity: parsedQuantity,
          userId: user.uid,
        }),
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Failed to place order.";
        throw new Error(message);
      }

      addToast("Order placed successfully. It is now pending processing.", "success");
      resetForm();
    } catch (error) {
      console.error("Failed to place order:", error);
      addToast(
        error instanceof Error ? error.message : "Failed to place order.",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Toast toasts={toasts} onRemove={removeToast} />

      <section className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
          Order Placement
        </div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] lg:text-3xl">
          New Order
        </h1>
        <p className="max-w-3xl text-sm text-[var(--color-text-muted)]">
          Categories are now grouped by platform, so every Instagram service stays
          under Instagram, Facebook under Facebook, and so on.
        </p>
      </section>

      {loadingServices ? (
        <OrderSkeleton />
      ) : servicesError ? (
        <ErrorState message={servicesError} />
      ) : (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <form
            onSubmit={handleSubmit}
            className="glass-card space-y-5 rounded-3xl p-6 lg:p-7"
          >
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                Create Order
              </h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Choose a platform first. Followers and subscribers now appear at
                the top, then the rest follow by demand priority and price.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-[var(--color-text-primary)]">
                Category
              </label>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {platformGroups.map((group) => {
                  const active = group.platform.key === selectedPlatformKey;

                  return (
                    <button
                      key={group.platform.key}
                      type="button"
                      onClick={() => handlePlatformChange(group.platform.key)}
                      className={`rounded-3xl border bg-gradient-to-br p-4 text-left transition-all duration-200 ${
                        active
                          ? `border-[var(--color-accent)]/40 ${group.platform.accentClass} shadow-lg shadow-black/20`
                          : "border-[var(--color-border)] bg-[var(--color-bg-secondary)]/70 hover:border-[var(--color-accent)]/25 hover:bg-[var(--color-bg-tertiary)]/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/15 text-[var(--color-text-primary)]">
                          <PlatformIcon platform={group.platform.key} className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                            {group.platform.label}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {group.services.length} services
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <SelectField
              label="Service"
              value={selectedServiceId}
              onChange={(value) => {
                setSelectedServiceId(value);
                setServiceError("");
                setQuantity("");
                setQuantityError("");
              }}
              error={serviceError}
              options={servicesInPlatform.map((service) => ({
                value: service.id,
                label: formatServiceOption(service),
              }))}
            />

            <Input
              label="Link"
              type="text"
              placeholder="Enter the target link"
              value={link}
              onChange={(event) => {
                setLink(event.target.value);
                if (linkError) setLinkError("");
              }}
              error={linkError}
              required
            />

            <div className="space-y-2">
              <Input
                label="Quantity"
                type="number"
                min={selectedService?.min ?? 1}
                max={selectedService?.max ?? undefined}
                step="1"
                inputMode="numeric"
                placeholder={
                  selectedService
                    ? `Min ${selectedService.min}, Max ${selectedService.max}`
                    : "Select a service first"
                }
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                  if (quantityError) setQuantityError("");
                }}
                error={quantityError}
                disabled={!selectedService}
                required
              />

              {selectedService ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  Allowed range: {selectedService.min.toLocaleString("en-IN")} -{" "}
                  {selectedService.max.toLocaleString("en-IN")}
                </p>
              ) : null}
            </div>

            <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/12 via-emerald-500/6 to-transparent p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                Total Charge
              </p>
              <p className="mt-2 text-xl sm:text-2xl lg:text-3xl font-bold text-emerald-300 truncate">
                {formatCurrency(totalCharge ?? 0)}
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Updates live in rupees as the user changes quantity.
              </p>
            </div>

            <Button type="submit" fullWidth isLoading={submitting}>
              Place Order
            </Button>
          </form>

          <aside className="glass-card space-y-5 rounded-3xl p-6 lg:p-7">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                Order Summary
              </h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Review the selected platform, limits, and pricing before checkout.
              </p>
            </div>

            <SummaryItem
              label="Current Balance"
              value={formatCurrency(userProfile?.balance ?? 0)}
              accent
            />
            <SummaryItem
              label="Platform"
              value={selectedPlatformGroup?.platform.label ?? "—"}
            />
            <SummaryItem
              label="Service"
              value={selectedService?.name ?? "Choose a service"}
            />
            <SummaryItem
              label="Provider Category"
              value={selectedService?.category ?? "—"}
            />
            <SummaryItem
              label="Price / 1000"
              value={selectedService ? formatCurrency(getServicePrice(selectedService)) : "—"}
            />
            <SummaryItem
              label="Estimated Charge"
              value={formatCurrency(totalCharge ?? 0)}
            />

            {selectedPlatformGroup ? (
              <div
                className={`rounded-3xl border border-[var(--color-border)] bg-gradient-to-br ${selectedPlatformGroup.platform.accentClass} p-5`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/15 text-[var(--color-text-primary)]">
                    <PlatformIcon
                      platform={selectedPlatformGroup.platform.key}
                      className="h-6 w-6"
                    />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                      Selected Platform
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
                      {selectedPlatformGroup.platform.label}
                    </h3>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <CompactStat
                    label="Services"
                    value={selectedPlatformGroup.services.length.toLocaleString("en-IN")}
                  />
                  <CompactStat
                    label="Starting From"
                    value={formatCurrency(
                      getServicePrice(selectedPlatformGroup.services[0] ?? selectedService!)
                    )}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/60 p-5 text-sm text-[var(--color-text-muted)]">
                Select a platform to reveal its sorted services.
              </div>
            )}
          </aside>
        </section>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-[var(--color-text-primary)]">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-2xl border bg-[var(--color-bg-tertiary)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition-all duration-200 ${
          error
            ? "border-red-500/40 focus:border-red-500"
            : "border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

function SummaryItem({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${
        accent
          ? "border-emerald-500/20 bg-emerald-500/10"
          : "border-[var(--color-border)] bg-[var(--color-bg-secondary)]/60"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p
        className={`mt-2 text-sm font-semibold ${
          accent ? "text-emerald-300" : "text-[var(--color-text-primary)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
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

function OrderSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="glass-card rounded-3xl border border-[var(--color-border)] p-6"
        >
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-40 rounded-full bg-white/10" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div className="h-20 rounded-3xl bg-white/5" />
              <div className="h-20 rounded-3xl bg-white/5" />
              <div className="h-20 rounded-3xl bg-white/5" />
            </div>
            <div className="h-14 rounded-2xl bg-white/5" />
            <div className="h-14 rounded-2xl bg-white/5" />
            <div className="h-28 rounded-3xl bg-white/5" />
            <div className="h-12 rounded-2xl bg-white/10" />
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

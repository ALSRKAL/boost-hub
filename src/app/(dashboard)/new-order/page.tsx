"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAgent } from "@/context/AgentContext";
import Button from "@/components/ui/Button";
import Input, { Textarea } from "@/components/ui/Input";
import Toast, { useToast } from "@/components/ui/Toast";
import PlatformIcon from "@/components/ui/PlatformIcon";
import ServicePicker from "@/components/new-order/ServicePicker";
import OrderGuide from "@/components/new-order/OrderGuide";
import Icon from "@/components/ui/Icon";
import {
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  SkeletonPanel,
} from "@/components/ui/Primitives";
import {
  formatCurrency,
  formatNumber,
} from "@/lib/constants";
import { formatAverageTimeBilingual } from "@/lib/i18n";
import { calculateCharge, roundMoney } from "@/lib/money";
import {
  getPlatformDisplayLabel,
  getServiceDisplayCategory,
  getServiceDisplayName,
  getServicePrice,
  groupServicesByPlatform,
  isCustomCommentsService,
  type ServiceItem,
} from "@/lib/services";
import { getServiceSections } from "@/lib/service-ordering";
import { localizeSectionLabel } from "@/lib/service-localization";
import { translateErrorMessage } from "@/lib/error-messages";
import {
  getServiceGuidance,
  validateServiceLink,
} from "@/lib/service-guidance";
import type { PlatformKey } from "@/lib/service-platforms";

interface FormErrors {
  service?: string;
  link?: string;
  quantity?: string;
  comments?: string;
  dripfeed?: string;
}

interface PlacedOrder {
  id: string;
  providerOrderId?: string;
  charge: number;
  pendingConfirmation?: boolean;
}

const MAX_COMMENT_LINES = 300;

function readErrorMessage(payload: unknown): string | null {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return null;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function validateTargetLink(
  raw: string,
  platformKey: PlatformKey | null,
  language: "en" | "ar"
): string | null {
  const link = raw.trim();
  const t = (en: string, ar: string) => (language === "ar" ? ar : en);

  if (!link) return t("Target link or username is required.", "رابط الهدف أو اسم المستخدم مطلوب.");
  if (/\s/.test(link)) return t("Remove spaces from the target.", "أزل المسافات من الهدف.");
  if (link.length < 3) return t("Target is too short.", "الهدف قصير جدًا.");
  if (link.length > 2048) return t("Target is too long.", "الهدف طويل جدًا.");

  const scheme = link.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();

  if (scheme && scheme !== "http" && scheme !== "https") {
    return t(
      "Only http:// and https:// links are accepted.",
      "يُقبل فقط روابط http:// و https://."
    );
  }

  if (platformKey === "website" && scheme !== "http" && scheme !== "https") {
    return t(
      "Traffic services require a full https:// URL.",
      "خدمات الزيارات تتطلب رابط https:// كاملًا."
    );
  }

  return null;
}

export default function NewOrderPage() {
  const { user, userProfile } = useAuth();
  const { language, t, pick } = useLanguage();
  const { pendingPatch, consumeFormPatch, setFormContext } = useAgent();
  const { toasts, addToast, removeToast } = useToast();
  const searchParams = useSearchParams();
  const preselectedServiceId = searchParams.get("service");

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [platformKey, setPlatformKey] = useState<string>("");
  const [sectionKey, setSectionKey] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("");

  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");
  const [comments, setComments] = useState("");
  const [dripfeed, setDripfeed] = useState(false);
  const [runs, setRuns] = useState("2");
  const [interval, setIntervalValue] = useState("60");

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<PlacedOrder | null>(null);
  const [agentFilled, setAgentFilled] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setLoadError(null);

        const response = await fetch("/api/services", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(
            readErrorMessage(payload) ?? "The catalog could not be loaded."
          );
        }

        if (!Array.isArray(payload)) {
          throw new Error("Unexpected catalog response.");
        }

        const nextServices = payload as ServiceItem[];
        setServices(nextServices);

        if (preselectedServiceId) {
          const groups = groupServicesByPlatform(nextServices);
          const group = groups.find((item) =>
            item.services.some((service) => service.id === preselectedServiceId)
          );

          if (group) {
            const sections = getServiceSections(
              group.services,
              group.platform.key
            );
            const section = sections.find((item) =>
              item.services.some((service) => service.id === preselectedServiceId)
            );

            setPlatformKey(group.platform.key);
            setSectionKey(section?.key ?? "");
            setServiceId(preselectedServiceId);
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load order catalog:", error);
        setLoadError(
          error instanceof Error
            ? error.message
            : "The catalog could not be loaded."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [preselectedServiceId, reloadKey]);

  const groups = useMemo(() => groupServicesByPlatform(services), [services]);

  const effectivePlatformKey =
    groups.find((group) => group.platform.key === platformKey)?.platform.key ??
    groups[0]?.platform.key ??
    "";

  const platformGroup =
    groups.find((group) => group.platform.key === effectivePlatformKey) ?? null;

  const sections = useMemo(
    () =>
      platformGroup
        ? getServiceSections(platformGroup.services, platformGroup.platform.key)
        : [],
    [platformGroup]
  );

  const effectiveSectionKey =
    sections.find((section) => section.key === sectionKey)?.key ??
    sections[0]?.key ??
    "";

  const section =
    sections.find((item) => item.key === effectiveSectionKey) ?? sections[0] ?? null;

  const sectionServices = section?.services ?? [];

  const selectedService =
    sectionServices.find((service) => service.id === serviceId) ??
    sectionServices[0] ??
    null;

  const price = selectedService ? getServicePrice(selectedService) : 0;
  const parsedQuantity = Number(quantity);
  const charge = selectedService
    ? calculateCharge(price, Number.isFinite(parsedQuantity) ? parsedQuantity : 0, {
        minimumMinor: 1,
      })
    : 0;
  const balance = Number(userProfile?.balance ?? 0);
  const balanceAfter = roundMoney(balance - charge);
  const insufficient = charge > 0 && charge > balance;
  const commentService = isCustomCommentsService(selectedService?.type);
  const commentLines = comments
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;

  const guidance = useMemo(
    () => (selectedService ? getServiceGuidance(selectedService) : null),
    [selectedService]
  );
  const liveLinkCheck = useMemo(
    () =>
      selectedService && link.trim()
        ? validateServiceLink(link, selectedService)
        : {},
    [link, selectedService]
  );
  const liveLinkError = liveLinkCheck.error
    ? pick(liveLinkCheck.error)
    : undefined;

  useEffect(() => {
    if (!pendingPatch || groups.length === 0) return;

    const targetId = pendingPatch.serviceId;

    if (!targetId) {
      consumeFormPatch();
      return;
    }

    const targetGroup = groups.find((group) =>
      group.services.some((service) => service.id === targetId)
    );

    if (!targetGroup) {
      consumeFormPatch();
      return;
    }

    const targetSections = getServiceSections(
      targetGroup.services,
      targetGroup.platform.key
    );
    const targetSection = targetSections.find((item) =>
      item.services.some((service) => service.id === targetId)
    );

    setPlatformKey(targetGroup.platform.key);
    setSectionKey(targetSection?.key ?? "");
    setServiceId(targetId);

    if (pendingPatch.link) setLink(pendingPatch.link);
    if (
      typeof pendingPatch.quantity === "number" &&
      pendingPatch.quantity > 0
    ) {
      setQuantity(String(pendingPatch.quantity));
    }
    if (typeof pendingPatch.comments === "string") {
      setComments(pendingPatch.comments);
    }
    if (typeof pendingPatch.dripFeed === "boolean") {
      setDripfeed(pendingPatch.dripFeed);
    }
    if (
      typeof pendingPatch.runs === "number" &&
      pendingPatch.runs > 0
    ) {
      setRuns(String(pendingPatch.runs));
    }
    if (
      typeof pendingPatch.interval === "number" &&
      pendingPatch.interval > 0
    ) {
      setIntervalValue(String(pendingPatch.interval));
    }

    setErrors({});
    setLastOrder(null);
    setAgentFilled(true);
    consumeFormPatch();
  }, [pendingPatch, groups, consumeFormPatch]);

  useEffect(() => {
    setFormContext({
      serviceId: selectedService?.id,
      serviceName: selectedService?.name,
      link: link.trim() || undefined,
      quantity:
        Number.isInteger(parsedQuantity) && parsedQuantity > 0
          ? parsedQuantity
          : undefined,
      platform: effectivePlatformKey || undefined,
      section: effectiveSectionKey || undefined,
    });
  }, [
    selectedService?.id,
    selectedService?.name,
    link,
    parsedQuantity,
    effectivePlatformKey,
    effectiveSectionKey,
    setFormContext,
  ]);

  function resetOptions() {
    setComments("");
    setDripfeed(false);
    setRuns("2");
    setIntervalValue("60");
    setErrors({});
    setLastOrder(null);
  }

  function handlePlatformChange(nextKey: string) {
    if (nextKey === effectivePlatformKey) return;
    setPlatformKey(nextKey);
    setSectionKey("");
    setServiceId("");
    setQuantity("");
    resetOptions();
  }

  function handleSectionChange(nextKey: string) {
    if (nextKey === effectiveSectionKey) return;
    setSectionKey(nextKey);
    setServiceId("");
    setQuantity("");
    resetOptions();
  }

  function handleServiceChange(nextId: string) {
    // A search can return a service from another section; follow it there.
    const targetSection = sections.find((item) =>
      item.services.some((service) => service.id === nextId)
    );

    if (targetSection) setSectionKey(targetSection.key);

    setServiceId(nextId);
    setQuantity("");
    resetOptions();
  }

  function validate(): FormErrors {
    const nextErrors: FormErrors = {};

    if (!selectedService) {
      nextErrors.service = t("Select a service first.", "اختر خدمة أولًا.");
    }

    const linkError = validateTargetLink(
      link,
      platformGroup?.platform.key ?? null,
      language
    );
    if (linkError) {
      nextErrors.link = linkError;
    } else if (liveLinkCheck.error) {
      nextErrors.link = pick(liveLinkCheck.error);
    }

    if (!quantity.trim()) {
      nextErrors.quantity = t("Enter a quantity.", "أدخل الكمية.");
    } else if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      nextErrors.quantity = t(
        "Use a whole number greater than zero.",
        "استخدم عددًا صحيحًا أكبر من صفر."
      );
    } else if (
      selectedService &&
      (parsedQuantity < selectedService.min || parsedQuantity > selectedService.max)
    ) {
      nextErrors.quantity = t(
        `Range is ${formatNumber(
          selectedService.min
        )}–${formatNumber(selectedService.max)}.`,
        `النطاق هو ${formatNumber(
          selectedService.min
        )}–${formatNumber(selectedService.max)}.`
      );
    }

    if (commentService) {
      if (commentLines === 0) {
        nextErrors.comments = t(
          "Add at least one comment, one per line.",
          "أضف تعليقًا واحدًا على الأقل، تعليقًا في كل سطر."
        );
      } else if (commentLines > MAX_COMMENT_LINES) {
        nextErrors.comments = t(
          `Maximum ${MAX_COMMENT_LINES} comments.`,
          `الحد الأقصى ${MAX_COMMENT_LINES} تعليق.`
        );
      } else if (
        comments.split(/\r?\n/).some((line) => line.trim().length > 500)
      ) {
        nextErrors.comments = t(
          "Each comment must be 500 characters or fewer.",
          "يجب ألا يزيد كل تعليق عن 500 حرف."
        );
      } else if (commentLines !== parsedQuantity) {
        nextErrors.quantity = t(
          `Quantity must equal the ${formatNumber(
            commentLines
          )} comment lines.`,
          `يجب أن تساوي الكمية عدد أسطر التعليقات (${formatNumber(
            commentLines
          )}).`
        );
      }
    }

    if (dripfeed && selectedService?.dripfeed) {
      const parsedRuns = Number(runs);
      const parsedInterval = Number(interval);

      if (!Number.isInteger(parsedRuns) || parsedRuns < 2) {
        nextErrors.dripfeed = t(
          "Use at least 2 runs.",
          "استخدم دفعتين على الأقل."
        );
      } else if (
        Number.isInteger(parsedQuantity) &&
        parsedRuns > parsedQuantity
      ) {
        nextErrors.dripfeed = t(
          "Runs cannot exceed the quantity.",
          "لا يمكن أن يتجاوز عدد الدفعات الكمية."
        );
      } else if (
        !Number.isInteger(parsedInterval) ||
        parsedInterval < 1 ||
        parsedInterval > 1440
      ) {
        nextErrors.dripfeed = t(
          "Interval must be 1–1440 minutes.",
          "يجب أن يكون الفاصل بين 1 و1440 دقيقة."
        );
      }
    }

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    if (!user?.uid || !selectedService) {
      addToast(t("Sign in again to place this order.", "سجّل الدخول مرة أخرى لإنشاء هذا الطلب."), "error");
      return;
    }

    if (charge <= 0) {
      addToast(t("The charge is zero. Check the quantity.", "المبلغ صفر. تحقق من الكمية."), "error");
      return;
    }

    if (insufficient) {
      addToast(
        t(
          "Insufficient balance. Add funds before ordering.",
          "الرصيد غير كافٍ. أضف رصيدًا قبل الطلب."
        ),
        "error"
      );
      return;
    }

    try {
      setSubmitting(true);
      const token = await user.getIdToken();
      const requestId = createRequestId();

      const response = await fetch("/api/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serviceId: selectedService.id,
          link: link.trim(),
          quantity: parsedQuantity,
          userId: user.uid,
          requestId,
          lang: language,
          ...(commentService ? { comments } : {}),
          ...(dripfeed && selectedService.dripfeed
            ? { runs: Number(runs), interval: Number(interval) }
            : {}),
        }),
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(readErrorMessage(payload) ?? "The order was rejected.");
      }

      const orderId =
        payload &&
        typeof payload === "object" &&
        "orderId" in payload &&
        typeof payload.orderId === "string"
          ? payload.orderId
          : requestId;
      const providerOrderId =
        payload &&
        typeof payload === "object" &&
        "providerOrderId" in payload &&
        typeof payload.providerOrderId === "string"
          ? payload.providerOrderId
          : undefined;
      const duplicate =
        payload &&
        typeof payload === "object" &&
        "duplicate" in payload &&
        payload.duplicate === true;
      const pendingConfirmation: boolean = Boolean(
        payload &&
        typeof payload === "object" &&
          "pendingConfirmation" in payload &&
          payload.pendingConfirmation === true
      );
      const pendingMessage =
        payload &&
        typeof payload === "object" &&
        "message" in payload &&
        typeof payload.message === "string"
          ? payload.message
          : t(
              "The provider did not confirm the order. Do not resubmit; support will reconcile it.",
              "لم يؤكد المزود الطلب. لا تُعد الإرسال؛ سيتولى الدعم تسويته."
            );
      const responseCharge =
        payload &&
        typeof payload === "object" &&
        "charge" in payload &&
        typeof payload.charge === "number"
          ? payload.charge
          : charge;

      setLink("");
      setQuantity("");
      resetOptions();
      setLastOrder({
        id: orderId,
        providerOrderId,
        charge: responseCharge,
        pendingConfirmation,
      });

      if (pendingConfirmation) {
        addToast(translateErrorMessage(pendingMessage, language), "info");
      } else if (duplicate) {
        addToast(
          t(
            "This order request was already processed.",
            "تمت معالجة طلب الشراء هذا مسبقًا."
          ),
          "info"
        );
      } else {
        addToast(
          t(
            `Order placed${providerOrderId ? ` · #${providerOrderId}` : ""}. Track it in Orders.`,
            `تم إنشاء الطلب${providerOrderId ? ` · #${providerOrderId}` : ""}. تابعته في الطلبات.`
          ),
          "success"
        );
      }

    } catch (error) {
      console.error("Failed to place order:", error);
      addToast(
        translateErrorMessage(
          error instanceof Error ? error.message : "The order was rejected.",
          language
        ),
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 pb-28 xl:pb-0">
      <Toast toasts={toasts} onRemove={removeToast} />

      <PageHeader
        eyebrow={t("Order desk", "مكتب الطلبات")}
        title={t("New order", "طلب جديد")}
        description={t(
          "Pick a platform, then a section, then the exact service. The charge is calculated from the per-1,000 rate.",
          "اختر المنصة ثم القسم ثم الخدمة المحددة. يُحسب المبلغ من سعر كل 1000 وحدة."
        )}
        actions={
          <span className="text-[12px] text-ink-mute">
            {t("Balance", "الرصيد")}{" "}
            <span className="num-sm font-medium text-ink">
              {formatCurrency(balance)}
            </span>
          </span>
        }
      />

      {agentFilled ? (
        <div className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] border border-[#cfdcef] bg-info-soft px-3 py-2.5 text-[12px] leading-5 text-info">
          <span>
            {t(
              "The assistant filled this form. Review the fields and confirm the order.",
              "قام المساعد بتعبئة هذا النموذج. راجع الحقول ثم أكد الطلب."
            )}
          </span>
          <button
            type="button"
            onClick={() => setAgentFilled(false)}
            className="-m-1 shrink-0 rounded p-1 hover:bg-surface/50"
            aria-label={t("Dismiss", "إغلاق")}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <SkeletonPanel lines={10} />
          <SkeletonPanel lines={6} />
        </div>
      ) : loadError ? (
        <ErrorState
          title={t("Catalog unavailable", "الكتالوج غير متاح")}
          message={translateErrorMessage(loadError, language)}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : services.length === 0 ? (
        <EmptyState
          icon="list"
          title={t("No services available", "لا توجد خدمات متاحة")}
          description={t(
            "The provider returned an empty catalog. Try again in a moment.",
            "أعاد المزود كتالوجًا فارغًا. حاول بعد قليل."
          )}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReloadKey((value) => value + 1)}
              leadingIcon={<Icon name="refresh" size={13} />}
            >
              {t("Reload catalog", "إعادة تحميل الكتالوج")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <OrderGuide service={selectedService} />
          <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <form
            id="new-order-form"
            className="panel min-w-0"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="panel-head">
              <h2 className="text-[13px] font-semibold text-ink">
                {t("Order details", "تفاصيل الطلب")}
              </h2>
              <span className="num-sm text-[11px] text-ink-mute">
                {t(
                  `${formatNumber(services.length)} services`,
                  `${formatNumber(services.length)} خدمة`
                )}
              </span>
            </div>

            <div className="space-y-5 p-4">
              <fieldset className="min-w-0">
                <legend className="field-label">
                  {t("Platform", "المنصة")}
                </legend>
                <div className="flex w-full min-w-0 flex-wrap gap-1.5 pb-0.5">
                  {groups.map((group) => {
                    const active = group.platform.key === effectivePlatformKey;

                    return (
                      <button
                        key={group.platform.key}
                        type="button"
                        className="chip"
                        aria-pressed={active}
                        onClick={() => handlePlatformChange(group.platform.key)}
                      >
                        <PlatformIcon
                          platform={group.platform.key}
                          className="h-3.5 w-3.5"
                        />
                        {getPlatformDisplayLabel(group.platform, language)}
                        <span className="chip-count">
                          {formatNumber(group.services.length)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {sections.length > 1 ? (
                <fieldset className="min-w-0">
                  <legend className="field-label">
                    {t("Section", "القسم")}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {sections.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="chip"
                        aria-pressed={item.key === effectiveSectionKey}
                        onClick={() => handleSectionChange(item.key)}
                      >
                        {language === "ar"
                          ? localizeSectionLabel(item.key, item.label)
                          : item.label}
                        <span className="chip-count">
                          {formatNumber(item.services.length)}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <div>
                <label className="field-label">{t("Service", "الخدمة")}</label>
                <ServicePicker
                  services={sectionServices}
                  searchServices={platformGroup?.services ?? sectionServices}
                  value={selectedService?.id ?? ""}
                  onChange={handleServiceChange}
                  invalid={Boolean(errors.service)}
                />
                {errors.service ? (
                  <p className="field-error" role="alert">
                    {errors.service}
                  </p>
                ) : null}

                {selectedService ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-mute">
                    <span>
                      {t("ID", "المعرف")}{" "}
                      <span className="num-sm text-ink">#{selectedService.id}</span>
                    </span>
                    <span>
                      {t("Rate", "السعر")}{" "}
                      <span className="num-sm text-ink">
                        {formatCurrency(price)}
                      </span>{" "}
                      {t("/ 1k", "/ 1000")}
                    </span>
                    <span>
                      {t("Range", "النطاق")}{" "}
                      <span className="num-sm text-ink">
                        {formatNumber(selectedService.min)}–
                        {formatNumber(selectedService.max)}
                      </span>
                    </span>
                    <span>
                      {t("Avg. time", "متوسط الوقت")}{" "}
                      <span className="text-ink">
                        {formatAverageTimeBilingual(
                          selectedService.averageTime,
                          language
                        )}
                      </span>
                    </span>
                    {selectedService.refill ? (
                      <span className="text-positive">
                        {t("Refill", "تعويض")}
                      </span>
                    ) : null}
                    {selectedService.cancel ? (
                      <span className="text-ink-soft">
                        {t("Cancelable", "قابل للإلغاء")}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div>
                <Input
                  label={t("Target link or username", "رابط الهدف أو اسم المستخدم")}
                  placeholder={
                    guidance
                      ? pick(guidance.placeholder)
                      : t("https://… or @username", "https://… أو @username")
                  }
                  value={link}
                  onChange={(event) => {
                    setLink(event.target.value);
                    if (errors.link)
                      setErrors((current) => ({ ...current, link: undefined }));
                    if (lastOrder) setLastOrder(null);
                  }}
                  error={errors.link ?? liveLinkError}
                  hint={
                    guidance
                      ? pick(guidance.instructions)
                      : t(
                          "Paste the exact profile or content link required by the service.",
                          "الصق رابط الملف الشخصي أو المحتوى المطلوب للخدمة."
                        )
                  }
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="url"
                  leadingIcon={<Icon name="link" size={14} />}
                />
                {liveLinkCheck.normalized && guidance ? (
                  <button
                    type="button"
                    className="mt-1.5 text-[11px] font-medium text-accent hover:underline"
                    onClick={() => {
                      setLink(liveLinkCheck.normalized!);
                      setErrors((current) => ({
                        ...current,
                        link: undefined,
                      }));
                    }}
                  >
                    {pick(guidance.normalizeCta)} ·{" "}
                    <span dir="ltr" className="font-mono">
                      {liveLinkCheck.normalized}
                    </span>
                  </button>
                ) : null}
              </div>

              <div>
                <Input
                  label={t("Quantity", "الكمية")}
                  type="number"
                  min={selectedService?.min ?? 1}
                  max={selectedService?.max ?? undefined}
                  step="1"
                  inputMode="numeric"
                  className="no-spinner"
                  placeholder={
                    selectedService
                      ? `${formatNumber(selectedService.min)}–${formatNumber(
                          selectedService.max
                        )}`
                      : t("Select a service first", "اختر خدمة أولًا")
                  }
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    if (errors.quantity)
                      setErrors((current) => ({ ...current, quantity: undefined }));
                    if (lastOrder) setLastOrder(null);
                  }}
                  error={errors.quantity}
                  disabled={!selectedService || commentService}
                  numeric
                  action={
                    selectedService && !commentService ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="text-[11px] font-medium text-accent hover:underline"
                          onClick={() => {
                            setQuantity(String(selectedService.min));
                            setErrors((current) => ({
                              ...current,
                              quantity: undefined,
                            }));
                          }}
                        >
                          {t("Min", "الأدنى")}
                        </button>
                        <span className="text-ink-mute">·</span>
                        <button
                          type="button"
                          className="text-[11px] font-medium text-accent hover:underline"
                          onClick={() => {
                            setQuantity(String(selectedService.max));
                            setErrors((current) => ({
                              ...current,
                              quantity: undefined,
                            }));
                          }}
                        >
                          {t("Max", "الأقصى")}
                        </button>
                      </div>
                    ) : undefined
                  }
                />
              </div>

              {commentService ? (
                <Textarea
                  label={t("Custom comments", "تعليقات مخصصة")}
                  placeholder={t(
                    "One comment per line\nGreat post\nKeep it up",
                    "تعليق واحد في كل سطر\nمنشور رائع\nاستمر"
                  )}
                  value={comments}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    const lineCount = nextValue
                      .split(/\r?\n/)
                      .map((line) => line.trim())
                      .filter(Boolean).length;
                    setComments(nextValue);
                    setQuantity(lineCount > 0 ? String(lineCount) : "");
                    if (errors.comments)
                      setErrors((current) => ({ ...current, comments: undefined }));
                    if (errors.quantity)
                      setErrors((current) => ({ ...current, quantity: undefined }));
                    if (lastOrder) setLastOrder(null);
                  }}
                  error={errors.comments}
                  hint={t(
                    `${formatNumber(commentLines)} comment${
                      commentLines === 1 ? "" : "s"
                    } · one per line · quantity is set from the line count`,
                    `${formatNumber(commentLines)} تعليق · تعليق واحد لكل سطر · يتم ضبط الكمية من عدد الأسطر`
                  )}
                  rows={5}
                  disabled={!selectedService}
                />
              ) : null}

              {selectedService?.dripfeed ? (
                <div className="panel-flat p-3">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={dripfeed}
                      onChange={(event) => {
                        setDripfeed(event.target.checked);
                        if (errors.dripfeed)
                          setErrors((current) => ({
                            ...current,
                            dripfeed: undefined,
                          }));
                      }}
                      className="mt-0.5 h-4 w-4 accent-[var(--ink)]"
                    />
                    <span>
                      <span className="block text-[12.5px] font-medium text-ink">
                        {t("Drip-feed delivery", "التسليم المرحلي")}
                      </span>
                      <span className="block text-[11.5px] text-ink-mute">
                        {t(
                          "Split the quantity across runs at a fixed interval.",
                          "قسّم الكمية على دفعات بفاصل زمني ثابت."
                        )}
                      </span>
                    </span>
                  </label>

                  {dripfeed ? (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <Input
                        label={t("Runs", "عدد الدفعات")}
                        type="number"
                        min={2}
                        step="1"
                        inputMode="numeric"
                        className="no-spinner"
                        value={runs}
                        onChange={(event) => {
                          setRuns(event.target.value);
                          if (errors.dripfeed)
                            setErrors((current) => ({
                              ...current,
                              dripfeed: undefined,
                            }));
                        }}
                        numeric
                      />
                      <Input
                        label={t("Interval (minutes)", "الفاصل (دقائق)")}
                        type="number"
                        min={1}
                        max={1440}
                        step="1"
                        inputMode="numeric"
                        className="no-spinner"
                        value={interval}
                        onChange={(event) => {
                          setIntervalValue(event.target.value);
                          if (errors.dripfeed)
                            setErrors((current) => ({
                              ...current,
                              dripfeed: undefined,
                            }));
                        }}
                        numeric
                      />
                      {errors.dripfeed ? (
                        <p className="field-error col-span-2" role="alert">
                          {errors.dripfeed}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {insufficient ? (
                <Notice tone="danger">
                  {t("This order costs", "تكلفة هذا الطلب")}{" "}
                  <span className="num-sm font-medium">{formatCurrency(charge)}</span>
                  {t(", more than your balance of ", "، أكثر من رصيدك البالغ ")}
                  <span className="num-sm font-medium">{formatCurrency(balance)}</span>.{" "}
                  <Link href="/add-funds" className="font-medium underline">
                    {t("Add funds", "إضافة رصيد")}
                  </Link>
                  .
                </Notice>
              ) : null}

              {lastOrder ? (
                <Notice tone={lastOrder.pendingConfirmation ? "warning" : "positive"}>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>
                      {lastOrder.pendingConfirmation
                        ? t(
                            "Order submitted; provider confirmation is pending.",
                            "تم إرسال الطلب؛ بانتظار تأكيد المزود."
                          )
                        : t("Order placed.", "تم إنشاء الطلب.")}
                    </span>
                    <span className="num-sm font-medium">
                      #{lastOrder.providerOrderId ?? lastOrder.id.slice(0, 8)}
                    </span>
                    {lastOrder.pendingConfirmation ? (
                      <span>
                        {t(
                          `Charged ${formatCurrency(
                            lastOrder.charge
                          )}. Do not resubmit.`,
                          `تم خصم ${formatCurrency(
                            lastOrder.charge
                          )}. لا تُعد الإرسال.`
                        )}
                      </span>
                    ) : (
                      <span>
                        {t(
                          `charged ${formatCurrency(lastOrder.charge)}.`,
                          `تم خصم ${formatCurrency(lastOrder.charge)}.`
                        )}
                      </span>
                    )}
                    <Link href="/orders" className="font-medium underline">
                      {t("Open orders", "عرض الطلبات")}
                    </Link>
                  </span>
                </Notice>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <Button
                  type="submit"
                  size="lg"
                  isLoading={submitting}
                  disabled={
                    !selectedService ||
                    insufficient ||
                    charge <= 0 ||
                    Boolean(liveLinkError)
                  }
                  leadingIcon={<Icon name="plus" size={15} />}
                >
                  {t("Place order", "تأكيد الطلب")}
                </Button>
                <p className="text-[11.5px] text-ink-mute">
                  {t(
                    "Charged from balance immediately. Provider acceptance creates the order reference.",
                    "يُخصم المبلغ من الرصيد فورًا. قبول المزود ينشئ مرجع الطلب."
                  )}
                </p>
              </div>
            </div>
          </form>

          <aside className="panel min-w-0 xl:sticky xl:top-20">
            <div className="panel-head">
              <h2 className="text-[13px] font-semibold text-ink">
                {t("Charge", "المبلغ")}
              </h2>
              {selectedService ? (
                <span className="num-sm text-[11px] text-ink-mute">
                  #{selectedService.id}
                </span>
              ) : null}
            </div>
            <div className="p-4">
              <p className="num text-[30px] font-medium leading-none text-ink">
                {formatCurrency(charge)}
              </p>
              <p className="mt-1.5 text-[11.5px] text-ink-mute">
                {selectedService
                  ? t(
                      `${formatCurrency(price)} per 1,000 × ${formatNumber(
                        Number.isInteger(parsedQuantity) ? parsedQuantity : 0
                      )}`,
                      `${formatCurrency(price)} لكل 1000 × ${formatNumber(
                        Number.isInteger(parsedQuantity) ? parsedQuantity : 0
                      )}`
                    )
                  : t(
                      "Select a service to calculate the charge.",
                      "اختر خدمة لحساب المبلغ."
                    )}
              </p>

              <dl className="mt-4 divide-y divide-line border-y border-line text-[12.5px]">
                <SummaryRow
                  label={t("Balance", "الرصيد")}
                  value={formatCurrency(balance)}
                  numeric
                />
                <SummaryRow
                  label={t("After order", "بعد الطلب")}
                  value={formatCurrency(balanceAfter)}
                  tone={balanceAfter < 0 ? "danger" : undefined}
                  numeric
                />
                <SummaryRow
                  label={t("Quantity", "الكمية")}
                  value={
                    Number.isInteger(parsedQuantity) && parsedQuantity > 0
                      ? formatNumber(parsedQuantity)
                      : "—"
                  }
                  numeric
                />
                <SummaryRow
                  label={t("Service rate", "سعر الخدمة")}
                  value={selectedService ? formatCurrency(price) : "—"}
                  numeric
                />
              </dl>

              {selectedService ? (
                <div className="mt-4 space-y-2">
                  <p className="text-[12.5px] font-medium leading-5 text-ink">
                    {getServiceDisplayName(selectedService, language)}
                  </p>
                  <p className="text-[11.5px] text-ink-mute">
                    {getServiceDisplayCategory(selectedService, language)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedService.refill ? (
                      <span className="status status-positive">
                        {t("Refill", "تعويض")}
                      </span>
                    ) : (
                      <span className="status status-neutral">
                        {t("No refill", "بدون تعويض")}
                      </span>
                    )}
                    {selectedService.cancel ? (
                      <span className="status status-info">
                        {t("Cancelable", "قابل للإلغاء")}
                      </span>
                    ) : null}
                    {selectedService.dripfeed ? (
                      <span className="status status-neutral">
                        {t("Drip-feed", "تسليم مرحلي")}
                      </span>
                    ) : null}
                  </div>

                  {commentService && commentLines > 0 ? (
                    <p className="text-[11.5px] text-ink-mute">
                      {t(
                        `${formatNumber(commentLines)} custom comment${
                          commentLines === 1 ? "" : "s"
                        } attached.`,
                        `تم إرفاق ${formatNumber(commentLines)} تعليق مخصص.`
                      )}
                    </p>
                  ) : null}

                  {dripfeed && selectedService.dripfeed ? (
                    <p className="text-[11.5px] text-ink-mute">
                      {t(
                        `${runs} runs · every ${interval} min`,
                        `${runs} دفعة · كل ${interval} دقيقة`
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>
          </div>

          {selectedService ? (
            <div
              className="fixed inset-x-0 bottom-0 z-30 border-t border-line-strong bg-canvas/95 px-4 pt-3 backdrop-blur xl:hidden"
              style={{
                paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
              }}
            >
              <div className="mx-auto flex max-w-[640px] items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] text-ink-mute">
                    {t("Total charge", "إجمالي المبلغ")}
                  </p>
                  <p className="num text-[20px] font-semibold leading-tight text-ink">
                    {formatCurrency(charge)}
                  </p>
                  <p className="num-sm text-[10px] text-ink-mute">
                    {t("Balance", "الرصيد")} {formatCurrency(balance)}
                  </p>
                </div>
                <Button
                  type="submit"
                  form="new-order-form"
                  size="lg"
                  isLoading={submitting}
                  disabled={
                    !selectedService ||
                    insufficient ||
                    charge <= 0 ||
                    Boolean(liveLinkError)
                  }
                  className="shrink-0"
                >
                  {t("Place order", "تأكيد الطلب")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  numeric = false,
  tone,
}: {
  label: string;
  value: string;
  numeric?: boolean;
  tone?: "danger";
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-ink-mute">{label}</dt>
      <dd
        className={`${numeric ? "num-sm" : ""} font-medium ${
          tone === "danger" ? "text-danger" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

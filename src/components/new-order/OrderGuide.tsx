"use client";

import { useLanguage } from "@/context/LanguageContext";
import Icon from "@/components/ui/Icon";
import type { ServiceItem } from "@/lib/services";
import { getServiceGuidance } from "@/lib/service-guidance";
import { formatCurrency } from "@/lib/constants";

export default function OrderGuide({ service }: { service: ServiceItem | null }) {
  const { t, pick } = useLanguage();

  if (!service) {
    return (
      <section className="panel px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] border border-line bg-subtle text-ink-mute">
            <Icon name="info" size={14} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[12.5px] font-semibold text-ink">
              {t("Order requirements & guide", "متطلبات الطلب ودليل الخدمة")}
            </h2>
            <p className="mt-0.5 text-[11.5px] leading-5 text-ink-mute">
              {t(
                "Select a service to see its exact link format, requirements, and guarantees.",
                "اختر خدمة لعرض صيغة الرابط المطلوبة والمتطلبات والضمانات."
              )}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const guide = getServiceGuidance(service);
  const targetTone =
    guide.target === "profile"
      ? "status-info"
      : guide.target === "post"
        ? "status-warning"
        : "status-neutral";

  return (
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[13px] font-semibold text-ink">
              {t("Order requirements & guide", "متطلبات الطلب ودليل الخدمة")}
            </h2>
            <span className={`status ${targetTone}`}>
              {pick(guide.targetLabel)}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-5 text-ink-mute">
            {pick(guide.instructions)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="min-w-0">
          <p className="rule-label">
            {t("Accepted link format", "صيغة الرابط المقبولة")}
          </p>
          <p
            dir="ltr"
            className="mt-1.5 break-all rounded-[var(--radius-xs)] border border-line bg-subtle px-2.5 py-2 font-mono text-[11px] leading-5 text-ink"
          >
            {pick(guide.example)}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-ink-mute">
            {t(
              "Paste the full URL exactly as shown. A username alone is accepted only for profile services.",
              "الصق الرابط الكامل كما هو موضح. يُقبل اسم المستخدم وحده فقط لخدمات الملف الشخصي."
            )}
          </p>
        </div>

        <div className="min-w-0">
          <p className="rule-label">
            {t("Service specifications", "مواصفات الخدمة")}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span
              className={`status ${
                service.refill ? "status-positive" : "status-neutral"
              }`}
            >
              {pick(guide.refill)}
            </span>
            <span
              className={`status ${
                service.cancel ? "status-info" : "status-neutral"
              }`}
            >
              {pick(guide.cancel)}
            </span>
            <span
              className={`status ${
                service.dripfeed ? "status-info" : "status-neutral"
              }`}
            >
              {pick(guide.dripfeed)}
            </span>
          </div>
          <dl className="mt-2.5 space-y-1.5 text-[11.5px]">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-ink-mute">{t("Speed", "السرعة")}</dt>
              <dd className="text-end text-ink">{pick(guide.speed)}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-ink-mute">{t("Price", "السعر")}</dt>
              <dd className="num-sm text-end text-ink">
                {pick(guide.pricing)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-ink-mute">{t("Range", "النطاق")}</dt>
              <dd className="num-sm text-end text-ink">{pick(guide.range)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] leading-5 text-ink-mute">
            {t(
              `Charge = quantity × ${formatCurrency(
                Number(service.price)
              )} per 1,000 units.`,
              `الإجمالي = الكمية × ${formatCurrency(
                Number(service.price)
              )} لكل 1000 وحدة.`
            )}
          </p>
        </div>
      </div>

      <div className="border-t border-line bg-subtle px-4 py-3">
        <p className="rule-label">
          {t("Readiness checklist", "قائمة التحقق قبل الطلب")}
        </p>
        <ul className="mt-2 grid gap-1.5 md:grid-cols-2">
          {guide.checklist.map((item) => (
            <li
              key={item.id}
              className={`flex items-start gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-[11.5px] leading-5 ${
                item.critical
                  ? "bg-warning-soft text-warning"
                  : "text-ink-soft"
              }`}
            >
              <Icon
                name={item.critical ? "alert" : "check"}
                size={13}
                className="mt-1 shrink-0"
              />
              <span>{pick(item.text)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-5 text-ink-mute">
          {pick(guide.refillDetail)} {pick(guide.cancelDetail)}
        </p>
      </div>
    </section>
  );
}

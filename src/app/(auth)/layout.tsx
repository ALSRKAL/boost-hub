"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { APP_CONFIG } from "@/lib/constants";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Icon from "@/components/ui/Icon";

const FACTS = [
  {
    labelEn: "Catalog",
    labelAr: "الكتالوج",
    valueEn: "Live provider rates with min/max, refill and cancel flags.",
    valueAr: "أسعار المزود المباشرة مع الحدود الدنيا والعليا وخيارات التعويض والإلغاء.",
  },
  {
    labelEn: "Settlement",
    labelAr: "التسوية",
    valueEn: "Manual UPI top-ups, reviewed and credited by an administrator.",
    valueAr: "إيداعات UPI يدوية يراجعها المدير ويضيفها إلى الرصيد.",
  },
  {
    labelEn: "Tracking",
    labelAr: "المتابعة",
    valueEn: "Order status, partial delivery, and refunds in one ledger.",
    valueAr: "حالة الطلب والتسليم الجزئي والاسترداد في سجل واحد.",
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading } = useAuth();
  const { language, t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || !userProfile) return;

    router.replace(
      userProfile.languageChosen === false ? "/welcome" : "/dashboard"
    );
  }, [user, userProfile, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (user) return null;

  return (
    <main className="min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,540px)]">
      <section className="hidden flex-col justify-between border-e border-line bg-surface px-10 py-9 lg:flex xl:px-14">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] bg-ink text-[12px] font-semibold text-white">
            B
          </span>
          <span>
            <span className="block text-[13px] font-semibold leading-4 text-ink">
              {APP_CONFIG.name}
            </span>
            <span className="block text-[10.5px] leading-4 text-ink-mute">
              {t(APP_CONFIG.tagline, "لوحة خدمات وسائل التواصل الاجتماعي")}
            </span>
          </span>
        </div>

        <div className="max-w-[430px]">
          <p className="rule-label">{t("Operations panel", "لوحة العمليات")}</p>
          <h1 className="mt-3 text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-ink">
            {t(
              "Place orders, follow delivery, settle the balance.",
              "أنشئ الطلبات وتابع التنفيذ وسوِّ الرصيد."
            )}
          </h1>
          <p className="mt-3 text-[13px] leading-6 text-ink-soft">
            {t(
              "One screen for the catalog, order ledger, and wallet. No dashboards that hide the numbers.",
              "شاشة واحدة للكتالوج وسجل الطلبات والمحفظة. لوحات لا تخفي الأرقام."
            )}
          </p>

          <dl className="mt-8 border-y border-line">
            {FACTS.map((fact) => (
              <div
                key={fact.labelEn}
                className="flex gap-4 border-b border-line py-3 last:border-b-0"
              >
                <dt className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-mute">
                  {language === "ar" ? fact.labelAr : fact.labelEn}
                </dt>
                <dd className="text-[12.5px] leading-5 text-ink-soft">
                  {language === "ar" ? fact.valueAr : fact.valueEn}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="flex items-center gap-1.5 text-[11px] text-ink-mute">
          <Icon name="shield" size={13} />
          {t(
            "Balance and prices are always shown in INR.",
            "يُعرض الرصيد والأسعار دائمًا بالروبية الهندية."
          )}
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] bg-ink text-[12px] font-semibold text-white">
              B
            </span>
            <span>
              <span className="block text-[13px] font-semibold leading-4 text-ink">
                {APP_CONFIG.name}
              </span>
              <span className="block text-[10.5px] leading-4 text-ink-mute">
                {t(APP_CONFIG.tagline, "لوحة خدمات وسائل التواصل الاجتماعي")}
              </span>
            </span>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { useLanguage } from "@/context/LanguageContext";
import { APP_CONFIG } from "@/lib/constants";

export default function NotFound() {
  const { t } = useLanguage();

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
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

        <div className="panel p-6">
          <p className="num-sm text-[11px] text-ink-mute">404</p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">
            {t("Page not found", "الصفحة غير موجودة")}
          </h1>
          <p className="mt-1.5 text-[12.5px] leading-5 text-ink-mute">
            {t(
              "This address does not match any screen in the panel. Check the link or return to the overview.",
              "هذا العنوان لا يطابق أي شاشة في اللوحة. تحقق من الرابط أو عد إلى النظرة العامة."
            )}
          </p>
          <Link href="/dashboard" className="btn btn-primary btn-md mt-5">
            <Icon name="dashboard" size={14} />
            {t("Back to overview", "العودة إلى النظرة العامة")}
          </Link>
        </div>
      </div>
    </main>
  );
}

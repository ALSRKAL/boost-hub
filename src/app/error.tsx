"use client";

import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { useLanguage } from "@/context/LanguageContext";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <div className="panel w-full max-w-md p-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-danger-soft text-danger">
          <Icon name="alert" size={16} />
        </span>
        <h1 className="mt-3 text-[20px] font-semibold tracking-[-0.02em] text-ink">
          {t("This screen failed to load", "تعذّر تحميل هذه الشاشة")}
        </h1>
        <p className="mt-1.5 text-[12.5px] leading-5 text-ink-mute">
          {t(
            "The error was logged. Retry the screen; if it keeps failing, contact the panel administrator.",
            "تم تسجيل الخطأ. أعد المحاولة؛ وإذا استمرت المشكلة فتواصل مع مدير اللوحة."
          )}
        </p>
        {error.digest ? (
          <p className="num-sm mt-2 text-[11px] text-ink-mute">
            {t("Reference", "المرجع")} {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <Button onClick={reset} leadingIcon={<Icon name="refresh" size={14} />}>
            {t("Try again", "حاول مرة أخرى")}
          </Button>
          <a href="/dashboard" className="btn btn-secondary btn-md">
            {t("Back to overview", "العودة إلى النظرة العامة")}
          </a>
        </div>
      </div>
    </main>
  );
}

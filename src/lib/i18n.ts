export type Language = "en" | "ar";

export const LANGUAGE_COOKIE = "lang";
export const DEFAULT_LANGUAGE: Language = "en";

export interface Bilingual {
  en: string;
  ar: string;
}

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "ar";
}

export function languageDir(language: Language): "ltr" | "rtl" {
  return language === "ar" ? "rtl" : "ltr";
}

export function pick(value: Bilingual, language: Language): string {
  return language === "ar" ? value.ar : value.en;
}

export function formatAverageTimeBilingual(
  value: string | null | undefined,
  language: Language
): string {
  const fallback = "—";

  if (!value?.trim()) return fallback;

  const trimmed = value.trim();

  if (!/^\d+(\.\d+)?$/.test(trimmed)) return trimmed;

  const minutes = Number.parseFloat(trimmed);
  const unit =
    minutes < 60
      ? language === "ar"
        ? "دقيقة"
        : "min"
      : minutes < 1440
        ? language === "ar"
          ? "ساعة"
          : "h"
        : language === "ar"
          ? "يوم"
          : "d";

  if (minutes < 60) {
    return `${Math.round(minutes)} ${unit}`;
  }

  if (minutes < 1440) {
    return `${(minutes / 60).toFixed(1).replace(/\.0$/, "")} ${unit}`;
  }

  return `${(minutes / 1440).toFixed(1).replace(/\.0$/, "")} ${unit}`;
}

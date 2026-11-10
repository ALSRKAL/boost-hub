import type { NextRequest } from "next/server";
import { isLanguage, type Language } from "@/lib/i18n";

/**
 * Resolves the response language for an API route. Order of precedence:
 * explicit request body, `lang` cookie set by the UI, `x-lang` header, then
 * Accept-Language. Defaults to English.
 */
export function readApiLanguage(
  request: NextRequest,
  bodyLanguage?: unknown
): Language {
  if (isLanguage(bodyLanguage)) return bodyLanguage;

  const cookieLanguage = request.cookies.get("lang")?.value;

  if (isLanguage(cookieLanguage)) return cookieLanguage;

  const headerLanguage = request.headers.get("x-lang");

  if (isLanguage(headerLanguage)) return headerLanguage;

  const queryLanguage = request.nextUrl.searchParams.get("lang");

  if (isLanguage(queryLanguage)) return queryLanguage;

  const acceptLanguage = request.headers.get("accept-language") ?? "";

  if (/(^|,)\s*ar\b/i.test(acceptLanguage)) return "ar";

  return "en";
}

export function localize(
  language: Language,
  english: string,
  arabic: string
): string {
  return language === "ar" ? arabic : english;
}

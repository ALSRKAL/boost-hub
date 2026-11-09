"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LANGUAGE_COOKIE,
  languageDir,
  type Bilingual,
  type Language,
} from "@/lib/i18n";

interface LanguageContextValue {
  language: Language;
  dir: "ltr" | "rtl";
  isArabic: boolean;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (en: string, ar: string) => string;
  pick: (value: Bilingual) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = languageDir(language);
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    document.cookie = `${LANGUAGE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setLanguageState(next);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "ar" ? "en" : "ar");
  }, [language, setLanguage]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      dir: languageDir(language),
      isArabic: language === "ar",
      setLanguage,
      toggleLanguage,
      t: (en: string, ar: string) => (language === "ar" ? ar : en),
      pick: (bilingual: Bilingual) =>
        language === "ar" ? bilingual.ar : bilingual.en,
    }),
    [language, setLanguage, toggleLanguage]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider.");
  }

  return context;
}

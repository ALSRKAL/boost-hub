"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { COLLECTIONS } from "@/lib/constants";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Icon from "@/components/ui/Icon";

type Choice = "ar" | "en";

const OPTIONS: Array<{
  value: Choice;
  native: string;
  title: string;
  description: string;
  dir: "rtl" | "ltr";
}> = [
  {
    value: "ar",
    native: "العربية",
    title: "ابدأ بالعربية",
    description: "واجهة كاملة من اليمين لليسار، أسعار وعملة واضحة، ومساعد ذكي يفهمك.",
    dir: "rtl",
  },
  {
    value: "en",
    native: "English",
    title: "Start in English",
    description: "A full left-to-right interface with clear pricing and a bilingual assistant.",
    dir: "ltr",
  },
];

export default function WelcomePage() {
  const { user, userProfile, loading } = useAuth();
  const { setLanguage } = useLanguage();
  const router = useRouter();
  const [selected, setSelected] = useState<Choice | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && userProfile?.languageChosen === true) {
      router.replace("/dashboard");
    }
  }, [loading, user, userProfile?.languageChosen, router]);

  async function choose(language: Choice) {
    if (!user || saving) return;

    setSelected(language);
    setSaving(true);
    setLanguage(language);

    try {
      if (isFirebaseConfigured) {
        await setDoc(
          doc(getFirebaseDb(), COLLECTIONS.users, user.uid),
          { preferredLanguage: language, languageChosen: true },
          { merge: true }
        );
      }
    } catch (error) {
      console.error("Failed to save the language preference:", error);
    } finally {
      router.replace("/dashboard");
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <LoadingSpinner size="lg" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-ink text-[14px] font-semibold text-white">
            B
          </span>
          <div>
            <p className="text-[14px] font-semibold leading-5 text-ink">BoostHub</p>
            <p className="text-[11px] leading-4 text-ink-mute">
              Social media services panel · لوحة خدمات السوشيال ميديا
            </p>
          </div>
        </div>

        <section className="panel overflow-hidden">
          <div className="border-b border-line px-5 py-5 sm:px-7">
            <p className="rule-label">01 / Language · اللغة</p>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[30px]">
              اختر لغتك قبل أن تبدأ
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-6 text-ink-mute" dir="ltr">
              Choose your language before you start. You can change it anytime from
              the header.
            </p>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
            {OPTIONS.map((option) => {
              const isSelected = selected === option.value;
              const isSaving = saving && isSelected;

              return (
                <button
                  key={option.value}
                  type="button"
                  dir={option.dir}
                  onClick={() => void choose(option.value)}
                  disabled={saving}
                  className={`group flex min-h-[190px] flex-col justify-between rounded-[var(--radius-md)] border p-5 text-start transition-colors ${
                    isSelected
                      ? "border-ink bg-sunken"
                      : "border-line-strong bg-surface hover:border-ink-mute hover:bg-subtle"
                  }`}
                >
                  <span className="flex w-full items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-line bg-canvas text-[13px] font-semibold text-ink">
                      {option.value === "ar" ? "ع" : "EN"}
                    </span>
                    {isSaving ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <Icon
                        name="chevron-left"
                        size={17}
                        className="mt-1 text-ink-mute transition-transform group-hover:-translate-x-0.5 rtl:rotate-180"
                      />
                    )}
                  </span>
                  <span className="mt-6 block">
                    <span className="block text-[22px] font-semibold leading-tight text-ink">
                      {option.native}
                    </span>
                    <span className="mt-1 block text-[12.5px] font-medium text-ink-soft">
                      {option.title}
                    </span>
                    <span className="mt-2 block text-[11.5px] leading-5 text-ink-mute">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-start gap-2 border-t border-line bg-subtle px-5 py-3 text-[11px] leading-5 text-ink-mute sm:px-7">
            <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
            <span>
              يُحفظ اختيارك في حسابك ويُطبّق تلقائيًا في المرة القادمة. · Your choice
              is saved to your account and applied next time.
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}

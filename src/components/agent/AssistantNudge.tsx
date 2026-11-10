"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAgent } from "@/context/AgentContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";

const SEEN_KEY = "smm:assistant-nudge-seen";
const DISMISSED_KEY = "smm:assistant-nudge-dismissed";
const ELIGIBLE_PATHS = new Set(["/dashboard", "/new-order", "/services"]);
const DISMISS_FOR_MS = 24 * 60 * 60 * 1000;

/**
 * A calm, dismissible prompt for people who stall on the catalogue. It waits
 * for a short idle period, then offers two concrete starting points and a
 * one-tap route into the AI assistant.
 */
export function AssistantNudge() {
  const { open, openAgent, sendMessage, formContext } = useAgent();
  const { user, userProfile } = useAuth();
  const { language } = useLanguage();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!user || userProfile?.role === "admin" || open || !ELIGIBLE_PATHS.has(pathname)) {
      return;
    }

    if (pathname === "/new-order" && formContext.serviceId) return;

    try {
      if (window.sessionStorage.getItem(SEEN_KEY)) return;
      const dismissedAt = Number(window.localStorage.getItem(DISMISSED_KEY) ?? 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_FOR_MS) return;
    } catch {
      // Storage can be unavailable in private/locked-down contexts.
    }

    const createdTime = user.metadata.creationTime
      ? new Date(user.metadata.creationTime).getTime()
      : 0;
    const isNewUser = createdTime > 0 && Date.now() - createdTime < 3 * 86_400_000;
    const idleDelay = isNewUser ? 7_000 : 16_000;

    let idleTimer = 0;
    let hideTimer = 0;
    let cancelled = false;

    const schedule = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        if (cancelled || visibleRef.current) return;
        setVisible(true);
        try {
          window.sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          // Ignore storage failures.
        }
        hideTimer = window.setTimeout(() => setVisible(false), 35_000);
      }, idleDelay);
    };

    const onActivity = () => {
      if (visibleRef.current) return;
      schedule();
    };

    schedule();
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true, capture: true });

    return () => {
      cancelled = true;
      window.clearTimeout(idleTimer);
      window.clearTimeout(hideTimer);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity, true);
    };
  }, [user, userProfile?.role, open, pathname, formContext.serviceId]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setVisible(false), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  function markSeen() {
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Ignore storage failures.
    }
  }

  function dismiss() {
    markSeen();
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Ignore storage failures.
    }
    setVisible(false);
  }

  function openAssistant() {
    markSeen();
    setVisible(false);
    openAgent();
  }

  function ask(prompt: string) {
    markSeen();
    setVisible(false);
    openAgent();
    void sendMessage(prompt);
  }

  if (
    !user ||
    userProfile?.role === "admin" ||
    !ELIGIBLE_PATHS.has(pathname) ||
    !visible ||
    open ||
    (pathname === "/new-order" && Boolean(formContext.serviceId))
  ) {
    return null;
  }

  const ar = language === "ar";
  const prompts = ar
    ? [
        "أبي متابعين إنستغرام بضمان، رشّح لي الخدمة",
        "أبي مشاهدات يوتيوب، رشّح لي الخدمة",
      ]
    : [
        "I want guaranteed Instagram followers — recommend a service",
        "I want YouTube views — recommend a service",
      ];

  return (
    <div
      className="assistant-nudge fixed bottom-36 end-4 z-40 w-[min(330px,calc(100vw-2rem))] sm:bottom-20"
      role="status"
      aria-live="polite"
    >
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-surface shadow-[var(--shadow-pop)]">
        <div className="flex items-start justify-between gap-2 border-b border-line px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-ink text-white">
              <span className="absolute inset-0 animate-ping rounded-[var(--radius-xs)] bg-accent/25" />
              <Icon name="message" size={14} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-ink">
                {ar ? "مساعد BoostHub" : "BoostHub assistant"}
              </p>
              <p className="text-[10px] text-ink-mute">
                {ar ? "نعرف وش تبي — خلّنا نختار لك" : "We know what you need"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="-m-1 shrink-0 rounded p-1 text-ink-mute hover:bg-sunken hover:text-ink"
            aria-label={ar ? "إغلاق الاقتراح" : "Dismiss suggestion"}
          >
            <Icon name="x" size={12} />
          </button>
        </div>

        <div className="px-3.5 py-3">
          <p className="text-[12.5px] font-medium leading-5 text-ink">
            {ar ? "محتاج مساعدة تختار؟" : "Not sure what to pick?"}
          </p>
          <p className="mt-1 text-[11.5px] leading-5 text-ink-mute">
            {ar
              ? "قل لنا هدفك بكلمات بسيطة، والمساعد يبحث لك عن الخدمة المناسبة ويجهّز الطلب."
              : "Tell us your goal in plain words and the assistant will find the right service and prepare the order."}
          </p>

          <div className="mt-2.5 flex flex-col gap-1.5">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => ask(prompt)}
                className="flex min-h-9 items-center justify-between gap-2 rounded-[var(--radius-xs)] border border-line bg-subtle px-2.5 py-1.5 text-start text-[11px] leading-4 text-ink-soft transition-colors hover:border-ink-mute hover:text-ink"
              >
                <span className="line-clamp-2">{prompt}</span>
                <Icon
                  name="chevron-left"
                  size={12}
                  className="shrink-0 text-ink-mute rtl:rotate-180"
                />
              </button>
            ))}
          </div>

          <Button
            size="sm"
            fullWidth
            className="mt-2.5"
            onClick={openAssistant}
            leadingIcon={<Icon name="message" size={13} />}
          >
            {ar ? "اسأل المساعد الذكي" : "Ask the AI assistant"}
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="mt-1.5 w-full py-1 text-center text-[10.5px] text-ink-mute hover:text-ink"
          >
            {ar ? "لاحقًا" : "Later"}
          </button>
        </div>
      </div>
    </div>
  );
}

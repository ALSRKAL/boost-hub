"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { AgentProvider } from "@/context/AgentContext";
import { useLanguage } from "@/context/LanguageContext";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { language, t } = useLanguage();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const draggableSelector = ".scroll-x";
    let active: {
      element: HTMLElement;
      startX: number;
      startScroll: number;
      dragged: boolean;
      sign: number;
    } | null = null;

    const markDraggable = () => {
      document.querySelectorAll<HTMLElement>(draggableSelector).forEach((element) => {
        if (element.scrollWidth > element.clientWidth + 1) {
          element.dataset.draggable = "true";
        } else {
          delete element.dataset.draggable;
        }
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>(draggableSelector);

      if (!element || element.scrollWidth <= element.clientWidth + 1) return;
      if (
        event.target.closest(
          "a, button, input, select, textarea, [role='button'], [role='tab']"
        )
      ) {
        return;
      }

      active = {
        element,
        startX: event.clientX,
        startScroll: element.scrollLeft,
        dragged: false,
        sign: window.getComputedStyle(element).direction === "rtl" ? 1 : -1,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!active) return;

      const delta = event.clientX - active.startX;

      if (!active.dragged && Math.abs(delta) < 6) return;

      if (!active.dragged) {
        active.dragged = true;
        active.element.classList.add("is-dragging");
        document.body.style.userSelect = "none";
      }

      active.element.scrollLeft = active.startScroll + active.sign * delta;
      event.preventDefault();
    };

    const finishDrag = () => {
      if (!active) return;
      active.element.classList.remove("is-dragging");
      document.body.style.userSelect = "";
      active = null;
    };

    const onResize = () => markDraggable();

    markDraggable();
    const observer = new MutationObserver(markDraggable);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", finishDrag);
    document.addEventListener("pointercancel", finishDrag);
    window.addEventListener("resize", onResize);

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", finishDrag);
      document.removeEventListener("pointercancel", finishDrag);
      window.removeEventListener("resize", onResize);
      document.body.style.userSelect = "";
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <LoadingSpinner size="lg" />
          <p className="text-[12px] text-ink-mute">
            {t("Opening your panel", "جارٍ فتح لوحتك")}
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <AgentProvider>
      <div className="min-h-screen bg-canvas">
        <a href="#main-content" className="skip-link">
          {language === "ar" ? "تجاوز إلى المحتوى" : "Skip to content"}
        </a>

        <Sidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        />

        <div
          className={`flex min-h-screen flex-col ${
            sidebarCollapsed ? "lg:ps-[60px]" : "lg:ps-[232px]"
          }`}
        >
          <Header onOpenNav={() => setMobileNavOpen(true)} />
          <main
            id="main-content"
            className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7"
          >
            <div className="mx-auto w-full max-w-[1320px]">{children}</div>
          </main>
        </div>
      </div>
    </AgentProvider>
  );
}

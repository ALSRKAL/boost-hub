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
  const { language } = useLanguage();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <LoadingSpinner size="lg" />
          <p className="text-[12px] text-ink-mute">Opening your panel</p>
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

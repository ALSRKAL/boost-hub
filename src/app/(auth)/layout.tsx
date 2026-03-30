"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{background: "linear-gradient(135deg, #0a0e1a 0%, #0d1b3e 50%, #0a0e1a 100%)"}}>
      {/* Animated blobs */}
      <div className="absolute top-[-15%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-30 blur-[120px]" style={{background: "radial-gradient(circle, #3b82f6, #8b5cf6)"}} />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-25 blur-[120px]" style={{background: "radial-gradient(circle, #06b6d4, #3b82f6)"}} />
      <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full opacity-15 blur-[100px]" style={{background: "radial-gradient(circle, #a855f7, #ec4899)"}} />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "50px 50px"}} />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-4 py-8">
        {children}
      </div>
    </div>
  );
}

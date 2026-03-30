"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { APP_CONFIG } from "@/lib/constants";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function LoginPage() {
  const { signIn, signInWithGoogle, clearError } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    try {
      setError(null);
      setLoading(true);
      clearError();
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed.";
      if (msg.includes("invalid-credential") || msg.includes("wrong-password")) {
        setError("Invalid email or password.");
      } else if (msg.includes("user-not-found")) {
        setError("No account found with this email.");
      } else if (msg.includes("too-many-requests")) {
        setError("Too many attempts. Please try again later.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      setError(null);
      setLoading(true);
      clearError();
      await signInWithGoogle();
      // On mobile with redirect, page will reload — no need to push
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google login failed.";
      if (!msg.includes("popup-closed")) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Brand Header */}
      <div className="text-center">
        {/* Logo */}
        <div className="relative inline-flex mb-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl flex items-center justify-center text-white font-black text-2xl sm:text-3xl shadow-2xl" style={{background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)"}}>
            B
          </div>
          <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-green-400 border-2 border-[#0a0e1a] flex items-center justify-center">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-300 animate-pulse" />
          </div>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Welcome to{" "}
          <span style={{background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text"}}>
            {APP_CONFIG.name}
          </span>
        </h1>
        <p className="text-xs sm:text-sm mt-2 font-medium" style={{color: "#94a3b8"}}>
          {APP_CONFIG.tagline}
        </p>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {[
          { value: "10K+", label: "Users" },
          { value: "99.9%", label: "Uptime" },
          { value: "24/7", label: "Support" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl p-2 sm:p-3 text-center" style={{background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)"}}>
            <div className="text-sm sm:text-base font-black" style={{background: "linear-gradient(135deg, #60a5fa, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text"}}>{stat.value}</div>
            <div className="text-[10px] sm:text-xs font-medium" style={{color: "#64748b"}}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="rounded-2xl p-5 sm:p-7" style={{background: "rgba(17,24,39,0.8)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(20px)", boxShadow: "0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)"}}>
        {/* Google Button — primary CTA */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          style={{background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))", border: "1px solid rgba(99,102,241,0.4)", color: "#e2e8f0", boxShadow: "0 4px 15px rgba(59,130,246,0.1)"}}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{background: "rgba(255,255,255,0.07)"}} />
          <span className="text-xs font-medium uppercase tracking-widest" style={{color: "#475569"}}>or sign in with email</span>
          <div className="flex-1 h-px" style={{background: "rgba(255,255,255,0.07)"}} />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 p-3 rounded-xl text-sm text-center font-medium" style={{background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171"}}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-1"
            style={{background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)", boxShadow: "0 4px 20px rgba(59,130,246,0.35)"}}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Signing in…
              </span>
            ) : "Sign In"}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className="text-center text-sm" style={{color: "#64748b"}}>
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-semibold transition-colors"
          style={{color: "#818cf8"}}
        >
          Create one free →
        </Link>
      </p>

      {/* Platform badges */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        {["📱 Instagram", "▶️ YouTube", "🎵 TikTok", "🐦 Twitter"].map((p) => (
          <span key={p} className="text-xs px-3 py-1 rounded-full font-medium" style={{background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "#64748b"}}>
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}


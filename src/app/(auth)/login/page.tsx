"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Icon from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Primitives";

function mapAuthError(message: string, language: "en" | "ar"): string {
  const ar = language === "ar";

  if (
    message.includes("invalid-credential") ||
    message.includes("wrong-password") ||
    message.includes("invalid-login-credentials")
  ) {
    return ar
      ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
      : "Email or password is incorrect.";
  }
  if (message.includes("user-not-found")) {
    return ar
      ? "لا يوجد حساب بهذا البريد الإلكتروني."
      : "No account exists with this email.";
  }
  if (message.includes("too-many-requests")) {
    return ar
      ? "محاولات كثيرة جدًا. انتظر دقيقة ثم حاول مرة أخرى."
      : "Too many attempts. Wait a minute and try again.";
  }
  if (message.includes("network-request-failed")) {
    return ar
      ? "الشبكة غير متاحة. تحقق من اتصالك وحاول مرة أخرى."
      : "Network unavailable. Check your connection and retry.";
  }
  if (message.includes("user-disabled")) {
    return ar ? "تم تعطيل هذا الحساب." : "This account has been disabled.";
  }
  if (message.includes("invalid-email")) {
    return ar ? "أدخل بريدًا إلكترونيًا صالحًا." : "Enter a valid email address.";
  }
  return ar ? "تعذّر تسجيل الدخول. حاول مرة أخرى." : "Sign in failed. Please try again.";
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { signIn, signInWithGoogle, resetPassword } = useAuth();
  const { language, t } = useLanguage();
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError(t("Enter your email address.", "أدخل بريدك الإلكتروني."));
      return;
    }

    if (mode === "reset") {
      try {
        setLoading(true);
        setError(null);
        await resetPassword(trimmedEmail);
        setResetSent(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "";

        // Do not leak whether the account exists.
        if (
          message.includes("user-not-found") ||
          message.includes("invalid-email")
        ) {
          setResetSent(true);
        } else if (message.includes("too-many-requests")) {
          setError(
            t(
              "Too many attempts. Wait a minute and try again.",
              "محاولات كثيرة جدًا. انتظر دقيقة ثم حاول مرة أخرى."
            )
          );
        } else if (message.includes("network-request-failed")) {
          setError(
            t(
              "Network unavailable. Check your connection and retry.",
              "الشبكة غير متاحة. تحقق من اتصالك وحاول مرة أخرى."
            )
          );
        } else {
          setError(
            t(
              "Could not send the reset email. Please try again.",
              "تعذّر إرسال بريد إعادة التعيين. حاول مرة أخرى."
            )
          );
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setError(t("Enter your password.", "أدخل كلمة المرور."));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await signIn(trimmedEmail, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(mapAuthError(err instanceof Error ? err.message : "", language));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (loading) return;

    try {
      setLoading(true);
      setError(null);
      const result = await signInWithGoogle();
      router.replace(result.isNewUser ? "/welcome" : "/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (!message.includes("popup-closed")) {
        setError(mapAuthError(message, language));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <p className="rule-label">{t("Account", "الحساب")}</p>
        <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.02em] text-ink">
          {mode === "reset"
            ? t("Reset password", "إعادة تعيين كلمة المرور")
            : t("Sign in", "تسجيل الدخول")}
        </h1>
        <p className="mt-1 text-[12.5px] leading-5 text-ink-mute">
          {mode === "reset"
            ? t(
                "We will email a link to set a new password.",
                "سنرسل رابطًا إلى بريدك لتعيين كلمة مرور جديدة."
              )
            : t(
                "Use your panel account to place orders and track delivery.",
                "استخدم حساب اللوحة لإنشاء الطلبات ومتابعة التنفيذ."
              )}
        </p>
      </div>

      {error ? (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}

      {resetSent ? (
        <div className="mb-4">
          <Notice tone="positive">
            {t(
              "If an account exists for",
              "إذا كان هناك حساب مرتبط بـ"
            )}{" "}
            <span className="font-medium">{email.trim()}</span>
            {t(
              ", a password reset link is on its way. Check the spam folder too.",
              "، فسيصل رابط إعادة تعيين كلمة المرور. تحقق أيضًا من مجلد الرسائل غير المرغوب فيها."
            )}
          </Notice>
        </div>
      ) : null}

      {mode === "signin" ? (
        <>
          <Button
            variant="secondary"
            fullWidth
            onClick={handleGoogle}
            disabled={loading}
            leadingIcon={<GoogleMark />}
          >
            {t("Continue with Google", "المتابعة باستخدام جوجل")}
          </Button>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-mute">
              {t("or use email", "أو استخدم البريد الإلكتروني")}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label={t("Email", "البريد الإلكتروني")}
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(null);
          }}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
        />

        {mode === "signin" ? (
          <Input
            label={t("Password", "كلمة المرور")}
            type={showPassword ? "text" : "password"}
            placeholder={t("Enter your password", "أدخل كلمة المرور")}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError(null);
            }}
            autoComplete="current-password"
            required
            action={
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setError(null);
                  setResetSent(false);
                }}
                className="text-[11.5px] font-medium text-accent hover:underline"
              >
                {t("Forgot password?", "نسيت كلمة المرور؟")}
              </button>
            }
            trailingAction={
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={
                  showPassword
                    ? t("Hide password", "إخفاء كلمة المرور")
                    : t("Show password", "إظهار كلمة المرور")
                }
                aria-pressed={showPassword}
                className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-ink-mute hover:bg-sunken hover:text-ink"
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={15} />
              </button>
            }
          />
        ) : null}

        <Button type="submit" fullWidth size="lg" isLoading={loading}>
          {mode === "reset"
            ? t("Send reset link", "إرسال رابط إعادة التعيين")
            : t("Sign in", "تسجيل الدخول")}
        </Button>
      </form>

      {mode === "reset" ? (
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(null);
            setResetSent(false);
          }}
          className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-ink-soft hover:text-ink"
        >
          <Icon name="chevron-left" size={13} className="rtl:rotate-180" />
          {t("Back to sign in", "العودة لتسجيل الدخول")}
        </button>
      ) : (
        <p className="mt-5 text-[12.5px] text-ink-mute">
          {t("New here?", "جديد هنا؟")}{" "}
          <Link href="/register" className="font-medium text-accent hover:underline">
            {t("Create an account", "إنشاء حساب")}
          </Link>
        </p>
      )}
    </div>
  );
}

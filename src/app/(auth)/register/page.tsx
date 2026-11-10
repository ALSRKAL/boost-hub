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

function mapRegisterError(message: string, language: "en" | "ar"): string {
  const ar = language === "ar";

  if (message.includes("email-already-in-use")) {
    return ar
      ? "يوجد حساب بهذا البريد الإلكتروني بالفعل. سجّل الدخول بدلًا من ذلك."
      : "An account already exists with this email. Sign in instead.";
  }
  if (message.includes("weak-password")) {
    return ar
      ? "يجب أن تكون كلمة المرور 6 أحرف على الأقل."
      : "Password must be at least 6 characters.";
  }
  if (message.includes("invalid-email")) {
    return ar ? "أدخل بريدًا إلكترونيًا صالحًا." : "Enter a valid email address.";
  }
  if (message.includes("network-request-failed")) {
    return ar
      ? "الشبكة غير متاحة. تحقق من اتصالك وحاول مرة أخرى."
      : "Network unavailable. Check your connection and retry.";
  }
  if (message.includes("too-many-requests")) {
    return ar
      ? "محاولات كثيرة جدًا. انتظر دقيقة ثم حاول مرة أخرى."
      : "Too many attempts. Wait a minute and try again.";
  }
  return ar
    ? "تعذّر إنشاء الحساب. حاول مرة أخرى."
    : "Could not create the account. Please try again.";
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

const PASSWORD_FIELD = "password" as const;
const CONFIRM_PASSWORD_FIELD = "confirmPassword" as const;

export default function RegisterPage() {
  const { signUp, signInWithGoogle } = useAuth();
  const { language, t } = useLanguage();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;

    const trimmedEmail = email.trim();
    const nextErrors: typeof fieldErrors = {};

    if (!trimmedEmail) {
      nextErrors.email = t("Email is required.", "البريد الإلكتروني مطلوب.");
    } else if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      nextErrors.email = t("Enter a valid email address.", "أدخل بريدًا إلكترونيًا صالحًا.");
    }

    if (password.length < 6) {
      nextErrors[PASSWORD_FIELD] = t(
        "Use at least 6 characters.",
        "استخدم 6 أحرف على الأقل."
      );
    }

    if (confirmPassword !== password) {
      nextErrors[CONFIRM_PASSWORD_FIELD] = t(
        "Passwords do not match.",
        "كلمتا المرور غير متطابقتين."
      );
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    try {
      setLoading(true);
      setError(null);
      await signUp(trimmedEmail, password);
      router.replace("/welcome");
    } catch (err: unknown) {
      setError(mapRegisterError(err instanceof Error ? err.message : "", language));
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
        setError(mapRegisterError(message, language));
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
          {t("Create account", "إنشاء حساب")}
        </h1>
        <p className="mt-1 text-[12.5px] leading-5 text-ink-mute">
          {t(
            "Your balance starts at zero. Add funds after signing in.",
            "يبدأ رصيدك من الصفر. أضف رصيدًا بعد تسجيل الدخول."
          )}
        </p>
      </div>

      {error ? (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}

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

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label={t("Email", "البريد الإلكتروني")}
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
            if (error) setError(null);
          }}
          error={fieldErrors.email}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
        />

        <Input
          label={t("Password", "كلمة المرور")}
          type={showPassword ? "text" : "password"}
          placeholder={t("At least 6 characters", "6 أحرف على الأقل")}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (fieldErrors.password)
              setFieldErrors((current) => ({ ...current, password: undefined }));
            if (error) setError(null);
          }}
          error={fieldErrors.password}
          autoComplete="new-password"
          required
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

        <Input
          label={t("Confirm password", "تأكيد كلمة المرور")}
          type={showPassword ? "text" : "password"}
          placeholder={t("Repeat your password", "أعد كتابة كلمة المرور")}
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            if (fieldErrors.confirmPassword)
              setFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
            if (error) setError(null);
          }}
          error={fieldErrors.confirmPassword}
          autoComplete="new-password"
          required
        />

        <Button type="submit" fullWidth size="lg" isLoading={loading}>
          {t("Create account", "إنشاء حساب")}
        </Button>
      </form>

      <p className="mt-5 text-[12.5px] text-ink-mute">
        {t("Already have an account?", "لديك حساب بالفعل؟")}{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t("Sign in", "تسجيل الدخول")}
        </Link>
      </p>
    </div>
  );
}

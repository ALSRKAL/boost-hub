"use client";

import Image from "next/image";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Toast, { useToast } from "@/components/ui/Toast";
import SearchInput from "@/components/ui/SearchInput";
import Tabs from "@/components/ui/Tabs";
import CopyButton from "@/components/ui/CopyButton";
import { StatusBadge } from "@/components/ui/Badge";
import {
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  SectionHeader,
  SkeletonRows,
} from "@/components/ui/Primitives";
import { APP_CONFIG, formatCurrency, formatDate } from "@/lib/constants";
import {
  subscribeUserDeposits,
  timestampToDate,
  type DepositDoc,
} from "@/lib/db";

const UPI_ID = process.env.NEXT_PUBLIC_UPI_ID ?? "";
const MIN_DEPOSIT = 10;
const MAX_DEPOSIT = 100_000;
const UTR_PATTERN = /^[A-Za-z0-9-]{8,40}$/;
const AMOUNT_PRESETS = [100, 500, 1000, 5000];

type DepositTab = "all" | DepositDoc["status"];

const TABS: Array<{ key: DepositTab; label: string; labelAr: string }> = [
  { key: "all", label: "All", labelAr: "الكل" },
  { key: "pending", label: "Pending", labelAr: "قيد الانتظار" },
  { key: "approved", label: "Approved", labelAr: "مقبول" },
  { key: "rejected", label: "Rejected", labelAr: "مرفوض" },
];

function readErrorMessage(payload: unknown): string | null {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return null;
}

export default function AddFundsPage() {
  const { user, userProfile } = useAuth();
  const { t } = useLanguage();
  const { toasts, addToast, removeToast } = useToast();

  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [amountError, setAmountError] = useState("");
  const [utrError, setUtrError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [deposits, setDeposits] = useState<DepositDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<DepositTab>("all");

  const deferredSearch = useDeferredValue(search);
  const query = deferredSearch.trim().toLowerCase();

  const handleHistoryError = useCallback(
    (error: Error) => {
      console.error("Failed to load deposits:", error);
      setLoadError("Your deposit history could not be loaded.");
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    if (!user?.uid) {
      setDeposits([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeUserDeposits(
      user.uid,
      (nextDeposits) => {
        setDeposits(nextDeposits);
        setLoading(false);
      },
      handleHistoryError
    );

    return unsubscribe;
  }, [user?.uid, reloadKey, handleHistoryError]);

  const counts = useMemo(() => {
    const byTab = Object.fromEntries(
      TABS.map((item) => [
        item.key,
        item.key === "all"
          ? deposits.length
          : deposits.filter((deposit) => deposit.status === item.key).length,
      ])
    ) as Record<DepositTab, number>;

    return byTab;
  }, [deposits]);

  const visibleDeposits = useMemo(
    () =>
      deposits.filter((deposit) => {
        if (tab !== "all" && deposit.status !== tab) return false;
        if (!query) return true;

        return [deposit.utr, deposit.status, String(deposit.amount), deposit.notes]
          .some((value) =>
            String(value ?? "").toLowerCase().includes(query)
          );
      }),
    [deposits, tab, query]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedAmount = amount.trim();
    const trimmedUtr = utr.trim().toUpperCase();
    const parsedAmount = Number(trimmedAmount);
    let hasError = false;

    if (!trimmedAmount) {
      setAmountError("Enter the amount you transferred.");
      hasError = true;
    } else if (!Number.isFinite(parsedAmount)) {
      setAmountError("Enter a valid amount.");
      hasError = true;
    } else if (parsedAmount < MIN_DEPOSIT) {
      setAmountError(`Minimum deposit is ${formatCurrency(MIN_DEPOSIT)}.`);
      hasError = true;
    } else if (parsedAmount > MAX_DEPOSIT) {
      setAmountError(`Maximum deposit is ${formatCurrency(MAX_DEPOSIT)}.`);
      hasError = true;
    } else {
      setAmountError("");
    }

    if (!trimmedUtr) {
      setUtrError("Transaction reference is required.");
      hasError = true;
    } else if (!UTR_PATTERN.test(trimmedUtr)) {
      setUtrError("Use 8–40 letters, digits, or hyphens.");
      hasError = true;
    } else {
      setUtrError("");
    }

    if (hasError) return;

    if (!user?.uid) {
      addToast("Sign in again to submit a deposit.", "error");
      return;
    }

    try {
      setSubmitting(true);
      const token = await user.getIdToken();
      const response = await fetch("/api/deposits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.uid,
          amount: parsedAmount,
          utr: trimmedUtr,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          readErrorMessage(payload) ?? "The deposit could not be submitted."
        );
      }

      setAmount("");
      setUtr("");
      setAmountError("");
      setUtrError("");
      addToast(
        "Deposit submitted. It is credited after an administrator verifies the payment.",
        "success"
      );
    } catch (error) {
      console.error("Failed to submit deposit:", error);
      addToast(
        error instanceof Error
          ? error.message
          : "The deposit could not be submitted.",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Toast toasts={toasts} onRemove={removeToast} />

      <PageHeader
        eyebrow={t("Wallet", "المحفظة")}
        title={t("Add funds", "إضافة رصيد")}
        description={t(
          "Pay by UPI, then submit the transaction reference. An administrator verifies it before the balance changes.",
          "ادفع عبر UPI ثم أرسل رقم عملية التحويل. يتحقق المدير منه قبل تحديث الرصيد."
        )}
        actions={
          <div className="text-end">
            <p className="rule-label">{t("Available", "المتاح")}</p>
            <p className="num-sm mt-0.5 font-semibold text-ink">
              {formatCurrency(Number(userProfile?.balance ?? 0))}
            </p>
          </div>
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="text-[13px] font-semibold text-ink">
                {t("Payment method", "طريقة الدفع")}
              </h2>
              <p className="text-[11.5px] text-ink-mute">
                {t(
                  "UPI transfer · manual verification",
                  "تحويل UPI · تحقق يدوي"
                )}
              </p>
            </div>
            <span className="status status-neutral">UPI</span>
          </div>

          <div className="grid gap-4 p-4 sm:grid-cols-[168px_minmax(0,1fr)]">
            <div>
              <div className="rounded-[var(--radius-sm)] border border-line bg-surface p-2">
                <Image
                  src="/payment-qr.png"
                  width={200}
                  height={200}
                  alt="UPI payment QR code"
                  className="h-auto w-full rounded-[var(--radius-xs)] object-contain"
                  priority
                />
              </div>
              <p className="mt-2 text-center text-[10.5px] text-ink-mute">
                {t("Scan with any UPI app", "امسح بأي تطبيق UPI")}
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-[var(--radius-sm)] border border-line bg-subtle p-3">
                <p className="rule-label">{t("UPI ID", "معرف UPI")}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="min-w-0 break-all font-mono text-[12.5px] font-medium text-ink">
                    {UPI_ID || t("Not configured", "غير مهيأ")}
                  </p>
                  {UPI_ID ? (
                    <CopyButton value={UPI_ID} label={t("Copy", "نسخ")} />
                  ) : null}
                </div>
              </div>

              {!UPI_ID ? (
                <Notice tone="warning">
                  {t(
                    "The UPI ID is not configured in this environment. Use the QR code or contact the administrator before paying.",
                    "معرف UPI غير مهيأ في هذه البيئة. استخدم رمز QR أو تواصل مع المدير قبل الدفع."
                  )}
                </Notice>
              ) : null}

              <ol className="space-y-2 text-[12px] leading-5 text-ink-soft">
                <li className="flex gap-2">
                  <span className="num-sm shrink-0 text-ink-mute">01</span>
                  {t(
                    `Send the exact amount in ${APP_CONFIG.currency.code} to the UPI ID or scan the QR code.`,
                    `أرسل المبلغ بالضبط بعملة ${APP_CONFIG.currency.code} إلى معرف UPI أو امسح رمز QR.`
                  )}
                </li>
                <li className="flex gap-2">
                  <span className="num-sm shrink-0 text-ink-mute">02</span>
                  {t(
                    "Copy the 12-digit UTR / transaction reference from your UPI app.",
                    "انسخ رقم UTR المكوّن من 12 رقمًا أو مرجع العملية من تطبيق UPI."
                  )}
                </li>
                <li className="flex gap-2">
                  <span className="num-sm shrink-0 text-ink-mute">03</span>
                  {t(
                    "Paste it in the form and submit. The balance updates after admin approval.",
                    "الصقه في النموذج وأرسله. يُحدّث الرصيد بعد موافقة المدير."
                  )}
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="text-[13px] font-semibold text-ink">
                {t("Submit payment", "إرسال الدفعة")}
              </h2>
              <p className="text-[11.5px] text-ink-mute">
                {t(
                  "Match the amount you actually transferred.",
                  "طابق المبلغ الذي قمت بتحويله فعليًا."
                )}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-4" noValidate>
            <div>
              <Input
                label={t(
                  `Amount (${APP_CONFIG.currency.code})`,
                  `المبلغ (${APP_CONFIG.currency.code})`
                )}
                type="number"
                min={MIN_DEPOSIT}
                max={MAX_DEPOSIT}
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  if (amountError) setAmountError("");
                }}
                error={amountError}
                numeric
                required
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {AMOUNT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="chip"
                    aria-pressed={Number(amount) === preset}
                    onClick={() => {
                      setAmount(String(preset));
                      if (amountError) setAmountError("");
                    }}
                  >
                    {formatCurrency(preset)}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label={t(
                "Transaction reference (UTR)",
                "مرجع العملية (UTR)"
              )}
              placeholder={t(
                "12-digit UPI reference",
                "مرجع UPI المكوّن من 12 رقمًا"
              )}
              value={utr}
              onChange={(event) => {
                setUtr(event.target.value);
                if (utrError) setUtrError("");
              }}
              error={utrError}
              hint={t(
                "8–40 letters, digits, or hyphens. The 12-digit UPI UTR is ideal.",
                "من 8 إلى 40 حرفًا أو رقمًا أو شرطة. رقم UTR المكوّن من 12 رقمًا هو الأفضل."
              )}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              numeric
              required
            />

            <div className="rounded-[var(--radius-sm)] border border-line bg-subtle px-3 py-2.5 text-[11.5px] leading-5 text-ink-mute">
              {t(
                "Each transaction reference can be submitted once. A rejected deposit keeps its reference, so check the history before retrying.",
                "يمكن إرسال كل مرجع عملية مرة واحدة فقط. يحتفظ الإيداع المرفوض بمرجعه، لذا راجع السجل قبل إعادة المحاولة."
              )}
            </div>

            <Button type="submit" fullWidth size="lg" isLoading={submitting}>
              {t("Submit deposit", "إرسال الإيداع")}
            </Button>
          </form>
        </section>
      </div>

      <section className="space-y-3">
        <SectionHeader
          title={t("Deposit history", "سجل الإيداعات")}
          description={t(
            "Pending requests, approved credits, and rejected references.",
            "الطلبات المعلقة والاعتمادات المقبولة والمراجع المرفوضة."
          )}
          actions={
            <span className="num-sm text-ink-mute">
              {t(`${counts.all} total`, `${counts.all} إجمالي`)}
            </span>
          }
        />

        <div className="space-y-3">
          <SearchInput
            label={t("Search deposits", "بحث في الإيداعات")}
            value={search}
            onChange={setSearch}
            placeholder={t(
              "Search by UTR, amount, status, or note",
              "ابحث برقم UTR أو المبلغ أو الحالة أو الملاحظة"
            )}
          />
          <div className="panel px-2 pt-1">
            <Tabs
              items={TABS.map((item) => ({
                key: item.key,
                label: t(item.label, item.labelAr),
                count: counts[item.key],
              }))}
              value={tab}
              onChange={setTab}
              label={t("Deposit status", "حالة الإيداع")}
            />
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={4} />
        ) : loadError ? (
          <ErrorState
            title={t("Deposit history unavailable", "سجل الإيداعات غير متاح")}
            message={loadError}
            onRetry={() => {
              setLoading(true);
              setLoadError(null);
              setReloadKey((value) => value + 1);
            }}
          />
        ) : visibleDeposits.length === 0 ? (
          <EmptyState
            icon="bank"
            title={
              deposits.length === 0
                ? t("No deposits yet", "لا توجد إيداعات بعد")
                : t("No deposits match", "لا توجد إيداعات مطابقة")
            }
            description={
              deposits.length === 0
                ? t(
                    "Submitted payments and their approval status will appear here.",
                    "ستظهر هنا المدفوعات المرسلة وحالة اعتمادها."
                  )
                : t(
                    "Change the status tab or clear the search to see more.",
                    "غيّر تبويب الحالة أو امسح البحث لعرض المزيد."
                  )
            }
            action={
              deposits.length > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setTab("all");
                  }}
                >
                  {t("Clear filters", "مسح عوامل التصفية")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="panel overflow-hidden">
            <div className="scroll-x hidden md:block">
              <table className="data-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>{t("Submitted", "تاريخ الإرسال")}</th>
                    <th className="cell-end">{t("Amount", "المبلغ")}</th>
                    <th>{t("Reference", "المرجع")}</th>
                    <th>{t("Status", "الحالة")}</th>
                    <th>{t("Reviewed", "تاريخ المراجعة")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDeposits.map((deposit) => (
                    <tr key={deposit.id}>
                      <td className="cell-date whitespace-nowrap">
                        {timestampToDate(deposit.createdAt)}
                      </td>
                      <td className="cell-end cell-num font-medium">
                        {formatCurrency(deposit.amount)}
                      </td>
                      <td>
                        <span className="num-sm text-ink">{deposit.utr}</span>
                      </td>
                      <td>
                        <div className="space-y-1">
                          <StatusBadge status={deposit.status} />
                          {deposit.notes ? (
                            <p className="max-w-[220px] text-[10.5px] text-ink-mute">
                              {deposit.notes}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="cell-date whitespace-nowrap text-[12px]">
                        {deposit.reviewedAt
                          ? formatDate(deposit.reviewedAt.toDate())
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {visibleDeposits.map((deposit) => (
                <div key={deposit.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="num-sm font-medium text-ink">
                        {formatCurrency(deposit.amount)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-mute">
                        {timestampToDate(deposit.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={deposit.status} />
                  </div>
                  <p className="num-sm mt-2 break-all text-[12px] text-ink-soft">
                    {deposit.utr}
                  </p>
                  {deposit.notes ? (
                    <p className="mt-1 text-[11px] text-ink-mute">{deposit.notes}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

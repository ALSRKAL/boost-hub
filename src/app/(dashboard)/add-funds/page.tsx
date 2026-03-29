"use client";

import Image from "next/image";
import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Toast, { useToast } from "@/components/ui/Toast";
import { APP_CONFIG, formatCurrency } from "@/lib/constants";
import {
  statusBadgeClass,
  subscribeUserDeposits,
  timestampToDate,
  type DepositDoc,
} from "@/lib/db";

const UPI_ID = process.env.NEXT_PUBLIC_UPI_ID ?? "";

export default function AddFundsPage() {
  const { user, userProfile } = useAuth();
  const { toasts, addToast, removeToast } = useToast();

  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [amountError, setAmountError] = useState("");
  const [utrError, setUtrError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [deposits, setDeposits] = useState<DepositDoc[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(true);

  const handleDepositHistoryError = useEffectEvent((error: Error) => {
    console.error("Failed to load user deposits:", error);
    setLoadingDeposits(false);
    addToast("Failed to load your deposit history. Please refresh the page.", "error");
  });

  useEffect(() => {
    if (!user?.uid) {
      setDeposits([]);
      setLoadingDeposits(false);
      return;
    }

    setLoadingDeposits(true);

    const unsubscribe = subscribeUserDeposits(
      user.uid,
      (nextDeposits) => {
        setDeposits(nextDeposits);
        setLoadingDeposits(false);
      },
      handleDepositHistoryError
    );

    return unsubscribe;
  }, [user?.uid]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedAmount = amount.trim();
    const trimmedUtr = utr.trim();
    const parsedAmount = Number(trimmedAmount);

    let hasError = false;

    if (!trimmedAmount) {
      setAmountError("Amount is required.");
      hasError = true;
    } else if (!Number.isFinite(parsedAmount) || parsedAmount < 10) {
      setAmountError("Minimum deposit amount is ₹10.");
      hasError = true;
    } else {
      setAmountError("");
    }

    if (!trimmedUtr) {
      setUtrError("Transaction ID / UTR is required.");
      hasError = true;
    } else {
      setUtrError("");
    }

    if (hasError) return;
    if (!user?.uid) {
      addToast("You must be logged in to submit a deposit.", "error");
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
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Failed to submit deposit.";
        throw new Error(message);
      }

      setAmount("");
      setUtr("");
      setAmountError("");
      setUtrError("");
      addToast(
        "Deposit submitted successfully. Waiting for admin approval.",
        "success"
      );
    } catch (error) {
      console.error("Failed to submit deposit:", error);
      addToast("Failed to submit deposit. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <Toast toasts={toasts} onRemove={removeToast} />

      <section className="space-y-2">
        <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text-primary)]">
          Add Funds
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] max-w-2xl">
          Submit your manual UPI payment here. Once the admin verifies it, the
          amount will be added to your balance.
        </p>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <PaymentInstructionsCard />

        <div className="glass-card rounded-3xl p-6 lg:p-7 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              Deposit Form
            </div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Submit Payment
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Use the exact amount you transferred and paste the transaction
              reference below.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              label={`Amount (${APP_CONFIG.currency.symbol})`}
              type="number"
              min="10"
              step="1"
              inputMode="decimal"
              placeholder="Enter deposit amount"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                if (amountError) setAmountError("");
              }}
              error={amountError}
              required
            />

            <Input
              label="Transaction ID / UTR"
              type="text"
              inputMode="numeric"
              placeholder="Enter your 12-digit UTR"
              value={utr}
              onChange={(event) => {
                setUtr(event.target.value);
                if (utrError) setUtrError("");
              }}
              error={utrError}
              required
            />

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/70 p-4 text-sm text-[var(--color-text-secondary)]">
              The amount will appear in your wallet only after admin approval.
            </div>

            <Button type="submit" fullWidth isLoading={submitting}>
              Submit Payment
            </Button>
          </form>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Deposit History
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Track your submitted payments and their approval status.
            </p>
          </div>
          <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-sm text-[var(--color-text-secondary)]">
            Current balance:{" "}
            <span className="font-semibold text-[var(--color-accent)]">
              {formatCurrency(userProfile?.balance ?? 0)}
            </span>
          </div>
        </div>

        <DepositHistoryTable
          deposits={deposits}
          loading={loadingDeposits}
        />
      </section>
    </div>
  );
}

function PaymentInstructionsCard() {
  return (
    <div className="glass-card rounded-3xl p-6 lg:p-7 space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          UPI Payment
        </div>
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
          Payment Instructions
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Pay using any UPI app like PhonePe, GPay, or Paytm, then submit the
          payment details for approval.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center">
        <div className="mx-auto w-full max-w-[240px]">
          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/80 p-5 shadow-inner">
            <Image
              src="/payment-qr.png"
              width={200}
              height={200}
              alt="UPI payment QR code for manual balance deposits"
              className="mx-auto h-[200px] w-[200px] rounded-2xl object-contain"
              priority
            />
          </div>
          <p className="mt-3 text-center text-xs text-[var(--color-text-muted)]">
            Scan this QR code to pay directly from your UPI app
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/70 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
              UPI ID
            </p>
            <p className="mt-2 font-mono text-lg font-semibold text-[var(--color-text-primary)] break-all">
              {UPI_ID || "UPI ID not configured"}
            </p>
          </div>

          <ol className="space-y-3 text-sm text-[var(--color-text-secondary)]">
            <li>1. Scan QR or copy UPI ID.</li>
            <li>
              2. Send the exact amount in {APP_CONFIG.currency.code} (
              {APP_CONFIG.currency.symbol}).
            </li>
            <li>3. Enter the 12-digit UTR (Transaction ID) below.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function DepositHistoryTable({
  deposits,
  loading,
}: {
  deposits: DepositDoc[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="glass-card rounded-3xl p-6 space-y-3">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="h-14 rounded-2xl animate-shimmer"
          />
        ))}
      </div>
    );
  }

  if (deposits.length === 0) {
    return (
      <div className="glass-card rounded-3xl p-10 text-center">
        <span className="block text-4xl mb-3">🧾</span>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
          No deposits yet
        </h3>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Your submitted payments will appear here after you use the form above.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl overflow-hidden">
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/60">
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Date
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Amount
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                UTR
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {deposits.map((deposit) => (
              <tr
                key={deposit.id}
                className="transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]/30"
              >
                <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                  {timestampToDate(deposit.createdAt)}
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-[var(--color-accent)]">
                  {formatCurrency(deposit.amount)}
                </td>
                <td className="px-6 py-4">
                  <code className="rounded-lg bg-[var(--color-bg-tertiary)] px-2.5 py-1.5 font-mono text-sm text-[var(--color-text-primary)]">
                    {deposit.utr}
                  </code>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${statusBadgeClass(deposit.status)}`}
                  >
                    {deposit.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[var(--color-border)] md:hidden">
        {deposits.map((deposit) => (
          <div key={deposit.id} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--color-text-secondary)]">
                {timestampToDate(deposit.createdAt)}
              </p>
              <span
                className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${statusBadgeClass(deposit.status)}`}
              >
                {deposit.status}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold text-[var(--color-accent)]">
                {formatCurrency(deposit.amount)}
              </span>
              <code className="rounded-lg bg-[var(--color-bg-tertiary)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-text-primary)]">
                {deposit.utr}
              </code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

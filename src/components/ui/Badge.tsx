"use client";

import type { ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";

export type StatusTone = "neutral" | "info" | "warning" | "positive" | "danger";

const STATUS_TONES: Record<string, StatusTone> = {
  pending: "warning",
  processing: "info",
  in_progress: "info",
  "in progress": "info",
  completed: "positive",
  approved: "positive",
  partial: "warning",
  cancelled: "danger",
  canceled: "danger",
  failed: "danger",
  rejected: "danger",
  refunded: "positive",
  requested: "info",
  admin: "info",
  user: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  "in progress": "In progress",
};

const STATUS_LABELS_AR: Record<string, string> = {
  pending: "قيد الانتظار",
  processing: "قيد المعالجة",
  in_progress: "قيد التنفيذ",
  "in progress": "قيد التنفيذ",
  completed: "مكتمل",
  approved: "مقبول",
  partial: "جزئي",
  cancelled: "ملغي",
  canceled: "ملغي",
  failed: "فاشل",
  rejected: "مرفوض",
  refunded: "مسترد",
  requested: "مطلوب",
  admin: "مدير",
  user: "عميل",
};

export function statusTone(status: string): StatusTone {
  return STATUS_TONES[status.toLowerCase()] ?? "neutral";
}

export function statusLabel(
  status: string,
  language: "en" | "ar" = "en"
): string {
  const normalized = status.toLowerCase();

  if (language === "ar") {
    return STATUS_LABELS_AR[normalized] ?? STATUS_LABELS[normalized] ?? status;
  }

  if (STATUS_LABELS[normalized]) return STATUS_LABELS[normalized];
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function StatusBadge({ status }: { status: string }) {
  const { language } = useLanguage();

  return (
    <span className={`status status-${statusTone(status)}`}>
      {statusLabel(status, language)}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

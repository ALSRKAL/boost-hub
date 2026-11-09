"use client";

import type { ReactNode } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";
import Button from "@/components/ui/Button";

// ============================================================
// Page header
// ============================================================

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="rule-label mb-1.5">{eyebrow}</p> : null}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-mute">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

// ============================================================
// Section header
// ============================================================

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[12.5px] text-ink-mute">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

// ============================================================
// Stat
// ============================================================

export function Stat({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "default" | "positive" | "warning" | "danger";
}) {
  const valueClass =
    tone === "positive"
      ? "text-positive"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-ink";

  return (
    <div className="panel px-4 py-3.5">
      <p className="rule-label">{label}</p>
      <p className={`num mt-2 text-[20px] font-medium leading-none ${valueClass}`}>
        {value}
      </p>
      {note ? <p className="mt-2 text-[11.5px] text-ink-mute">{note}</p> : null}
    </div>
  );
}

// ============================================================
// States
// ============================================================

export function EmptyState({
  icon = "list",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-line bg-subtle text-ink-mute">
        <Icon name={icon} size={17} />
      </span>
      <h3 className="mt-3 text-[14px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-[12.5px] leading-5 text-ink-mute">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className="panel border-[#e7c3bf] px-6 py-10 text-center">
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-danger-soft text-danger">
        <Icon name="alert" size={17} />
      </span>
      <h3 className="mt-3 text-[14px] font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-5 text-ink-mute">
        {message}
      </p>
      {onRetry ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={onRetry}
          leadingIcon={<Icon name="refresh" size={13} />}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "danger" | "positive";
  children: ReactNode;
}) {
  const classes = {
    info: "border-[#cfdcef] bg-info-soft text-info",
    warning: "border-[#eed9b4] bg-warning-soft text-warning",
    danger: "border-[#eec9c5] bg-danger-soft text-danger",
    positive: "border-[#c4e2cf] bg-positive-soft text-positive",
  } as const;
  const icons: Record<typeof tone, IconName> = {
    info: "info",
    warning: "alert",
    danger: "alert",
    positive: "check",
  };

  return (
    <div
      className={`flex items-start gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2.5 text-[12.5px] leading-5 ${classes[tone]}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      <Icon name={icons[tone]} size={14} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ============================================================
// Skeletons
// ============================================================

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="panel overflow-hidden" aria-hidden="true">
      <div className="border-b border-line bg-subtle px-4 py-2.5">
        <div className="skeleton h-3 w-28" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-b-0"
        >
          <div className="skeleton h-3 w-16" />
          <div className="skeleton h-3 flex-1" />
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPanel({ lines = 4 }: { lines?: number }) {
  return (
    <div className="panel space-y-3 p-4" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="skeleton h-4"
          style={{ width: `${100 - index * 8}%` }}
        />
      ))}
    </div>
  );
}

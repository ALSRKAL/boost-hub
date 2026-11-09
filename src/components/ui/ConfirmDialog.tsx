"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  isBusy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isBusy) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
      previousFocus.current?.focus();
    };
  }, [open, isBusy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink/35"
        aria-label={cancelLabel}
        onClick={() => {
          if (!isBusy) onCancel();
        }}
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="relative w-full max-w-sm rounded-md border border-line-strong bg-surface p-5 shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${
              tone === "danger"
                ? "bg-danger-soft text-danger"
                : "bg-accent-soft text-accent"
            }`}
          >
            <Icon name={tone === "danger" ? "alert" : "info"} size={16} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-[14px] font-semibold text-ink">
              {title}
            </h2>
            <div
              id="confirm-dialog-description"
              className="mt-1.5 text-[12.5px] leading-5 text-ink-mute"
            >
              {description}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            ref={cancelRef}
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={isBusy}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger-solid" : "primary"}
            size="sm"
            onClick={onConfirm}
            isLoading={isBusy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

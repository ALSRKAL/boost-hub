"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Icon, { type IconName } from "@/components/ui/Icon";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  message: ReactNode;
  type: ToastType;
}

interface ToastProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

const tone: Record<ToastType, { icon: IconName; className: string }> = {
  success: { icon: "check", className: "text-positive" },
  error: { icon: "alert", className: "text-danger" },
  info: { icon: "info", className: "text-info" },
};

function ToastItem({
  toast,
  onRemove,
}: {
  toast: ToastMessage;
  onRemove: (id: string) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onRemove(toast.id), 6000);
    return () => window.clearTimeout(timer);
  }, [toast.id, onRemove]);

  const { icon, className } = tone[toast.type];

  return (
    <div
      className="pointer-events-auto flex items-start gap-3 rounded-md border border-line-strong bg-surface p-3 shadow-[var(--shadow-pop)]"
      role={toast.type === "error" ? "alert" : "status"}
    >
      <Icon name={icon} size={15} className={`mt-0.5 shrink-0 ${className}`} />
      <p className="min-w-0 flex-1 text-[13px] leading-5 text-ink">{toast.message}</p>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="-m-1 shrink-0 rounded p-1 text-ink-mute transition-colors hover:bg-sunken hover:text-ink"
        aria-label="Dismiss notification"
      >
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

export default function Toast({ toasts, onRemove }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[100] flex flex-col gap-2 sm:inset-x-auto sm:end-4 sm:bottom-4 sm:w-[360px]"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

// ============================================================
// Hook
// ============================================================

let toastSequence = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message: ReactNode, type: ToastType = "info") => {
    toastSequence += 1;
    const id = `toast-${Date.now()}-${toastSequence}`;
    setToasts((current) => [...current, { id, message, type }]);
    return id;
  }, []);

  return { toasts, addToast, removeToast };
}

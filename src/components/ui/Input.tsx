"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

interface FieldShellProps {
  id: string;
  label?: string;
  hint?: ReactNode;
  error?: string;
  action?: ReactNode;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, action, children }: FieldShellProps) {
  return (
    <div className="w-full">
      {label ? (
        <div className="field-label-row">
          <label htmlFor={id} className="field-label mb-0">
            {label}
          </label>
          {action}
        </div>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field-hint mt-1.5">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  action?: ReactNode;
  leadingIcon?: ReactNode;
  trailingAction?: ReactNode;
  numeric?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    action,
    leadingIcon,
    trailingAction,
    numeric = false,
    className = "",
    id,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} action={action}>
      <div className="relative">
        {leadingIcon ? (
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-mute">
            {leadingIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`control ${numeric ? "control-num" : ""} ${
            error ? "control-invalid" : ""
          } ${leadingIcon ? "ps-9" : ""} ${trailingAction ? "pe-10" : ""} ${className}`}
          {...props}
        />
        {trailingAction ? (
          <span className="absolute inset-y-0 end-1 flex items-center">
            {trailingAction}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
});

export default Input;

// ============================================================
// Textarea
// ============================================================

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  action?: ReactNode;
  numeric?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, hint, error, action, numeric = false, className = "", id, ...props },
    ref
  ) {
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    const describedBy = error
      ? `${textareaId}-error`
      : hint
        ? `${textareaId}-hint`
        : undefined;

    return (
      <FieldShell
        id={textareaId}
        label={label}
        hint={hint}
        error={error}
        action={action}
      >
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`control ${numeric ? "control-num" : ""} ${
            error ? "control-invalid" : ""
          } ${className}`}
          {...props}
        />
      </FieldShell>
    );
  }
);

// ============================================================
// Select
// ============================================================

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className = "", id, children, ...props },
  ref
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <FieldShell id={selectId} label={label} hint={hint} error={error}>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`control ${error ? "control-invalid" : ""} ${className}`}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
});

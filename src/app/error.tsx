"use client";

import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <div className="panel w-full max-w-md p-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-danger-soft text-danger">
          <Icon name="alert" size={16} />
        </span>
        <h1 className="mt-3 text-[20px] font-semibold tracking-[-0.02em] text-ink">
          This screen failed to load
        </h1>
        <p className="mt-1.5 text-[12.5px] leading-5 text-ink-mute">
          The error was logged. Retry the screen; if it keeps failing, contact the
          panel administrator.
        </p>
        {error.digest ? (
          <p className="num-sm mt-2 text-[11px] text-ink-mute">
            Reference {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <Button onClick={reset} leadingIcon={<Icon name="refresh" size={14} />}>
            Try again
          </Button>
          <a href="/dashboard" className="btn btn-secondary btn-md">
            Back to overview
          </a>
        </div>
      </div>
    </main>
  );
}

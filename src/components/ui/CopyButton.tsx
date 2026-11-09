"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

export default function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }

    setCopied(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="btn btn-secondary btn-sm"
      aria-label={copied ? copiedLabel : label}
    >
      <Icon name={copied ? "check" : "copy"} size={12} />
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}

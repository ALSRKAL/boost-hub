"use client";

import Icon from "@/components/ui/Icon";
import { useLanguage } from "@/context/LanguageContext";

export default function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  const { t } = useLanguage();

  return (
    <div className={`relative ${className}`}>
      <label className="sr-only" htmlFor={`search-${label.replace(/\s+/g, "-")}`}>
        {label}
      </label>
      <Icon
        name="search"
        size={15}
        className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-mute"
      />
      <input
        id={`search-${label.replace(/\s+/g, "-")}`}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="control ps-9 pe-9"
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("Clear search", "مسح البحث")}
          className="absolute inset-y-0 end-2 my-auto flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] text-ink-mute transition-colors hover:bg-sunken hover:text-ink"
        >
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </div>
  );
}

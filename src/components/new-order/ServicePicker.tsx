"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Icon from "@/components/ui/Icon";
import { formatCurrency, formatNumber } from "@/lib/constants";
import { getServicePrice, type ServiceItem } from "@/lib/services";

export default function ServicePicker({
  services,
  searchServices,
  value,
  onChange,
  invalid = false,
}: {
  services: ServiceItem[];
  searchServices?: ServiceItem[];
  value: string;
  onChange: (serviceId: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = services.find((service) => service.id === value) ?? null;

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const source = normalized ? (searchServices ?? services) : services;

    if (!normalized) return source;

    return source.filter((service) =>
      [service.id, service.name, service.category, service.type].some((field) =>
        field.toLowerCase().includes(normalized)
      )
    );
  }, [query, services, searchServices]);

  const filtered = useMemo(() => matches.slice(0, 80), [matches]);

  useEffect(() => {
    if (!open) return;

    const selectedIndex = filtered.findIndex((service) => service.id === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setQuery("");
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
    // Only re-run when the popover opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => {
    setActiveIndex((index) => {
      if (filtered.length === 0) return 0;
      return Math.min(index, filtered.length - 1);
    });
  }, [filtered.length]);

  function select(service: ServiceItem) {
    onChange(service.id);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const service = filtered[activeIndex];
      if (service) select(service);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`control flex items-center justify-between gap-3 text-start ${
          invalid ? "control-invalid" : ""
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((valueNow) => !valueNow)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={`truncate ${selected ? "text-ink" : "text-ink-mute"}`}>
          {selected
            ? `#${selected.id} · ${selected.name}`
            : `Select a service (${formatNumber(services.length)})`}
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className={`shrink-0 text-ink-mute transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-line-strong bg-surface shadow-[var(--shadow-pop)]">
          <div className="border-b border-line p-2">
            <div className="relative">
              <Icon
                name="search"
                size={14}
                className="pointer-events-none absolute inset-y-0 start-2.5 my-auto text-ink-mute"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Filter by name, ID, or category"
                className="control h-9 ps-8 text-[13px]"
                role="combobox"
                aria-expanded="true"
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={
                  filtered[activeIndex]
                    ? `${listboxId}-option-${filtered[activeIndex].id}`
                    : undefined
                }
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label="Services"
            className="scroll-thin max-h-[280px] overflow-y-auto p-1"
          >
            {matches.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-[12.5px] text-ink-mute">
                No services match “{query}”.
              </p>
            ) : (
              filtered.map((service, index) => {
                const isActive = index === activeIndex;
                const isSelected = service.id === value;

                return (
                  <div
                    key={service.id}
                    ref={(node) => {
                      if (node) optionRefs.current.set(index, node);
                      else optionRefs.current.delete(index);
                    }}
                    id={`${listboxId}-option-${service.id}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      select(service);
                    }}
                    className={`flex cursor-pointer items-start justify-between gap-3 rounded-[var(--radius-xs)] px-2.5 py-2 ${
                      isActive ? "bg-sunken" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-ink">
                        {service.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-mute">
                        #{service.id} · {service.category} ·{" "}
                        {formatNumber(service.min)}–{formatNumber(service.max)}
                      </p>
                    </div>
                    <span className="num-sm shrink-0 text-[11.5px] font-medium text-ink">
                      {formatCurrency(getServicePrice(service))}
                    </span>
                  </div>
                );
              })
            )}
            {matches.length > filtered.length ? (
              <p className="border-t border-line px-2.5 py-2 text-[10.5px] text-ink-mute">
                Showing the first {filtered.length} of {matches.length}. Refine the
                search to narrow the list.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

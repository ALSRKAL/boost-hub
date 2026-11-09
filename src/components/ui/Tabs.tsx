"use client";

export interface TabItem<T extends string> {
  key: T;
  label: string;
  count?: number;
}

export default function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: Array<TabItem<T>>;
  value: T;
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="tab"
          aria-pressed={value === item.key}
          onClick={() => onChange(item.key)}
        >
          {item.label}
          {typeof item.count === "number" ? (
            <span className="tab-count num">{item.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

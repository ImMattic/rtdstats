"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// ── Shared building blocks for the live-map and Trip Explorer filter menus ───
// Everything here is presentational and controlled: the menus own the state, so
// a draft can be discarded on Reset without any of these needing to know.

interface FilterSectionProps {
  title: string;
  /** Rendered as a pill beside the title when non-zero — how many options are on. */
  activeCount?: number;
  /** Short line under the title, for a group whose meaning isn't obvious. */
  hint?: string;
  defaultOpen?: boolean;
  /**
   * Milliseconds of entrance delay, for a menu that reveals its groups in
   * sequence. It rides on the section itself rather than a wrapper, so the
   * dividers between siblings survive.
   */
  stagger?: number;
  children: React.ReactNode;
}

/** Collapsible group. Closed sections keep their children mounted so a search
 *  typed inside one survives a collapse. */
export function FilterSection({
  title,
  activeCount = 0,
  hint,
  defaultOpen = false,
  stagger,
  children,
}: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div
      className={cn(
        "border-b border-line last:border-b-0",
        stagger !== undefined && "animate-stagger-in",
      )}
      style={
        stagger === undefined
          ? undefined
          : ({ "--stagger": `${stagger}ms` } as React.CSSProperties)
      }
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center gap-2 py-3 text-left transition-colors hover:text-fg"
      >
        <span className="flex-1 text-sm font-semibold text-fg">{title}</span>
        {activeCount > 0 && (
          <span
            key={activeCount}
            className="animate-badge-pop rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-accent-ink"
          >
            {activeCount}
          </span>
        )}
        <ChevronIcon
          className={cn(
            "h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-300 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <div className="collapsible" data-open={open} id={id}>
        <div className="collapsible-inner">
          <div className="pb-3">
            {hint && <p className="mb-2 text-[11px] leading-snug text-fg-subtle">{hint}</p>}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface ChipOption {
  value: string;
  label: string;
  count?: number;
  /** Data-driven swatch (headway ramp, route brand colour) shown before the label. */
  dotColor?: string;
}

interface FilterChipsProps {
  options: ChipOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Hide options nothing matched, instead of showing a dead chip reading 0. */
  hideEmpty?: boolean;
}

/** Multi-select chip row. Nothing selected means the group isn't narrowing. */
export function FilterChips({ options, selected, onToggle, hideEmpty }: FilterChipsProps) {
  const shown = hideEmpty ? options.filter((o) => o.count === undefined || o.count > 0) : options;
  if (shown.length === 0) {
    return <p className="text-xs text-fg-subtle">Nothing to filter here right now.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            aria-pressed={on}
            className={cn(
              "press flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-[transform,background-color,border-color,color] duration-150",
              on
                ? "border-accent bg-accent/15 text-accent"
                : "border-line bg-raised text-fg-muted hover:border-line-strong hover:text-fg",
            )}
          >
            {o.dotColor && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: o.dotColor }}
              />
            )}
            {o.label}
            {o.count !== undefined && (
              <span className={cn("text-[10px]", on ? "text-accent/80" : "text-fg-subtle")}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface ListOption {
  value: string;
  label: string;
  sublabel?: string;
  /** Small coloured pill on the right — the route a vehicle is serving. */
  badge?: { text: string; color: string };
  dotColor?: string;
  count?: number;
  /** Section header this option sorts under, e.g. "Rail" / "Bus". */
  group?: string;
}

/**
 * Keep already-selected values in the list even after they drop out of the data
 * behind it — a vehicle that has finished for the night, or a route the current
 * query no longer counts. Without this the only way to untick one would be to
 * clear the whole group.
 */
export function withSelectedOptions(
  options: ListOption[],
  selected: string[],
  synthesize: (value: string) => ListOption,
): ListOption[] {
  const present = new Set(options.map((o) => o.value));
  const missing = selected.filter((v) => !present.has(v)).map(synthesize);
  return missing.length > 0 ? [...missing, ...options] : options;
}

interface FilterOptionListProps {
  options: ListOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onSetMany: (values: string[], on: boolean) => void;
  searchPlaceholder: string;
  emptyLabel: string;
  /** Rows before the list starts scrolling on its own. */
  maxHeightClass?: string;
}

/**
 * Searchable checkbox list for the long groups — routes and fleet numbers run to
 * hundreds of entries, so the menu carries its own search rather than making
 * someone scroll for one of them. "All"/"None" act on what the search is showing,
 * which is the only reading that stays useful once a query is typed.
 */
export function FilterOptionList({
  options,
  selected,
  onToggle,
  onSetMany,
  searchPlaceholder,
  emptyLabel,
  maxHeightClass = "max-h-56",
}: FilterOptionListProps) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel?.toLowerCase().includes(q) ?? false) ||
        (o.badge?.text.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ListOption[]>();
    for (const o of visible) {
      const key = o.group ?? "";
      const list = map.get(key);
      if (list) list.push(o);
      else map.set(key, [o]);
    }
    return [...map.entries()];
  }, [visible]);

  const visibleValues = visible.map((o) => o.value);
  const allVisibleOn =
    visibleValues.length > 0 && visibleValues.every((v) => selected.includes(v));

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1.5 rounded-md border border-line bg-raised px-2 py-1.5 transition-colors focus-within:border-accent">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="shrink-0 text-fg-subtle transition-colors hover:text-fg"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSetMany(visibleValues, !allVisibleOn)}
          disabled={visibleValues.length === 0}
          className="press shrink-0 rounded-md border border-line px-2 py-1.5 text-[11px] font-semibold text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          {allVisibleOn ? "None" : "All"}
        </button>
      </div>

      <div className={cn("overflow-y-auto rounded-md border border-line", maxHeightClass)}>
        {visible.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-fg-subtle">{emptyLabel}</p>
        ) : (
          grouped.map(([group, list]) => (
            <div key={group || "_"}>
              {group && (
                <p className="sticky top-0 z-10 border-b border-line bg-raised px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-fg-subtle">
                  {group}
                </p>
              )}
              {list.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onToggle(o.value)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full items-center gap-2.5 border-b border-line px-2.5 py-2 text-left transition-colors last:border-b-0",
                      on ? "bg-accent/10" : "hover:bg-raised",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        on ? "border-accent bg-accent text-accent-ink" : "border-line-strong",
                      )}
                    >
                      {on && <CheckIcon className="h-3 w-3" />}
                    </span>
                    {o.dotColor && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: o.dotColor }}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          on ? "text-accent" : "text-fg",
                        )}
                      >
                        {o.label}
                      </span>
                      {o.sublabel && (
                        <span className="block truncate text-[11px] text-fg-subtle">
                          {o.sublabel}
                        </span>
                      )}
                    </span>
                    {o.badge && (
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white"
                        style={{ backgroundColor: o.badge.color }}
                      >
                        {o.badge.text}
                      </span>
                    )}
                    {o.count !== undefined && (
                      <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">
                        {o.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface FilterToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  count?: number;
}

/** Switch row for the yes/no filters. */
export function FilterToggle({ label, hint, checked, onChange, count }: FilterToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-md py-1.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-fg">
          {label}
          {count !== undefined && (
            <span className="ml-1.5 text-[11px] text-fg-subtle">{count}</span>
          )}
        </span>
        {hint && <span className="block text-[11px] leading-snug text-fg-subtle">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-out motion-reduce:transition-none",
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

interface RangeInputsProps {
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  unit: string;
  presets?: { label: string; min: number | null; max: number | null }[];
}

/** A min/max pair with one-tap presets — used for trip duration. */
export function FilterRange({ min, max, onChange, unit, presets = [] }: RangeInputsProps) {
  const parse = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-[11px] text-fg-subtle">Min</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={min ?? ""}
            onChange={(e) => onChange(parse(e.target.value), max)}
            placeholder="any"
            className="w-full rounded-md border border-line bg-raised px-2 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent"
          />
        </label>
        <span className="mt-5 text-xs text-fg-subtle">to</span>
        <label className="flex-1">
          <span className="mb-1 block text-[11px] text-fg-subtle">Max</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={max ?? ""}
            onChange={(e) => onChange(min, parse(e.target.value))}
            placeholder="any"
            className="w-full rounded-md border border-line bg-raised px-2 py-1.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent"
          />
        </label>
        <span className="mt-5 shrink-0 text-xs text-fg-subtle">{unit}</span>
      </div>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const on = p.min === min && p.max === max;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(on ? null : p.min, on ? null : p.max)}
                aria-pressed={on}
                className={cn(
                  "press rounded-full border px-2.5 py-1 text-xs font-medium transition-[transform,background-color,border-color,color] duration-150",
                  on
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-raised text-fg-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Removable summary chip for the applied-filter row above a result list. */
export function ActiveFilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 py-1 pl-2.5 pr-1 text-xs font-medium text-accent">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="rounded-full p-0.5 transition-colors hover:bg-accent/20"
      >
        <CloseIcon className="h-3 w-3" />
      </button>
    </span>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────

export function FilterIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M3.5 5.25A.75.75 0 0 1 4.25 4.5h11.5a.75.75 0 0 1 .56 1.247l-4.31 4.87v4.026a.75.75 0 0 1-.4.663l-2.5 1.313A.75.75 0 0 1 8 15.956v-5.34L3.69 5.748a.75.75 0 0 1-.19-.497Z" />
    </svg>
  );
}

function ChevronIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CloseIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.704 5.29a.75.75 0 0 1 .006 1.06l-7.5 7.6a.75.75 0 0 1-1.07-.005l-3.75-3.83a.75.75 0 1 1 1.07-1.05l3.216 3.284 6.967-7.06a.75.75 0 0 1 1.06-.006Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

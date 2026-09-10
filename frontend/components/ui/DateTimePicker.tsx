"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsPhone } from "@/lib/useMediaQuery";
import {
  calendarDays,
  clampLocal,
  endOfDay,
  fromLocalInput,
  isDaySelectable,
  isSameDay,
  isWithin,
  startOfDay,
  toLocalInput,
  type FieldBounds,
} from "@/lib/dateRange";

interface Props {
  label: string;
  /** `"YYYY-MM-DDTHH:mm"` in local time. */
  value: string;
  onChange: (value: string) => void;
  /** Inclusive selectable window. Anything outside it is greyed out, not rejected. */
  bounds: FieldBounds;
  id?: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const MONTH_YEAR = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const FULL_DATE = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const TRIGGER_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function hourLabel(h: number): string {
  const suffix = h < 12 ? "AM" : "PM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${suffix}`;
}

/**
 * Date + time field that greys out anything the API would reject.
 *
 * On a phone this is the platform's own `datetime-local` control with `min`/`max`
 * set, because the OS pickers honour those attributes and beat any web widget for
 * one-thumb use. Everywhere else it is a calendar of our own, so the control
 * matches the rest of the site rather than the browser's default chrome — and so
 * unreachable days read as disabled rather than as an error after the fact.
 */
export default function DateTimePicker({ label, value, onChange, bounds, id }: Props) {
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const labelId = `${reactId}-label`;
  const triggerId = `${reactId}-trigger`;

  const selected = fromLocalInput(value);
  const min = fromLocalInput(bounds.min);
  const max = fromLocalInput(bounds.max);

  // The month on screen, which moves independently of the selection while paging.
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    startOfDay(selected ?? min ?? new Date()),
  );

  // Re-centre on the selection whenever the popover is opened, so it never opens
  // on whatever month was last browsed.
  useEffect(() => {
    if (open && selected) setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const commit = useCallback(
    (next: Date) => {
      onChange(clampLocal(toLocalInput(next), bounds));
    },
    [onChange, bounds],
  );

  const days = useMemo(() => calendarDays(viewMonth), [viewMonth]);
  const today = new Date();

  // Paging stops at the edge of the data window rather than scrolling into months
  // where every day is dead.
  const prevMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  const nextMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  const prevDisabled = Boolean(min && endOfDay(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0)) < min);
  const nextDisabled = Boolean(max && nextMonth > max);

  function selectDay(day: Date) {
    const base = selected ?? day;
    commit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes()));
  }

  function setTime(hours: number, minutes: number) {
    const base = selected ?? min ?? new Date();
    commit(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes));
  }

  // On the first and last selectable day only part of the clock is reachable, so
  // the hour and minute lists disable what falls outside the window.
  const hourEnabled = (h: number): boolean => {
    if (!selected) return true;
    const from = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), h, 0);
    const to = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), h, 59);
    return (!min || to >= min) && (!max || from <= max);
  };
  const minuteEnabled = (m: number): boolean => {
    if (!selected) return true;
    const at = new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate(),
      selected.getHours(),
      m,
    );
    return isWithin(at, min, max);
  };

  const fieldClass =
    "rounded border border-line bg-card px-2 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent";

  if (isPhone) {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id ?? triggerId} className="text-xs font-medium text-fg-subtle">
          {label}
        </label>
        <input
          id={id ?? triggerId}
          type="datetime-local"
          value={value}
          min={bounds.min}
          max={bounds.max}
          onChange={(e) => onChange(e.target.value)}
          // A stubborn keyboard can still type an out-of-range value; settle it on
          // blur so what is shown is what will be sent.
          onBlur={(e) => onChange(clampLocal(e.target.value, bounds))}
          className={fieldClass}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* The trigger's own text is the chosen date, so the field name has to come
          from the caption — hence labelledby over a plain <label>, which cannot
          point at a button. */}
      <span id={labelId} className="text-xs font-medium text-fg-subtle">
        {label}
      </span>
      <div ref={containerRef} className="relative">
        <button
          id={id ?? triggerId}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={`${labelId} ${id ?? triggerId}`}
          className={cn(
            fieldClass,
            "flex w-56 items-center gap-2 text-left tabular-nums",
            open && "ring-2 ring-accent",
          )}
        >
          <svg className="h-3.5 w-3.5 shrink-0 text-fg-subtle" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M6 2a.75.75 0 0 1 .75.75V4h6.5V2.75a.75.75 0 0 1 1.5 0V4h.25A2.25 2.25 0 0 1 17.25 6.25v9A2.25 2.25 0 0 1 15 17.5H5a2.25 2.25 0 0 1-2.25-2.25v-9A2.25 2.25 0 0 1 5 4h.25V2.75A.75.75 0 0 1 6 2ZM4.25 8v7.25c0 .414.336.75.75.75h10a.75.75 0 0 0 .75-.75V8H4.25Z"
              clipRule="evenodd"
            />
          </svg>
          <span className="truncate">{selected ? TRIGGER_FORMAT.format(selected) : "Select…"}</span>
        </button>

        {open && (
          <div
            role="dialog"
            aria-label={`${label} date and time`}
            className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-line bg-card p-3 shadow-card"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth(prevMonth)}
                disabled={prevDisabled}
                aria-label="Previous month"
                className="grid h-7 w-7 place-items-center rounded text-fg-muted transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1 0 1.06L9.06 10l3.73 3.71a.75.75 0 1 1-1.06 1.06l-4.25-4.24a.75.75 0 0 1 0-1.06l4.25-4.24a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-fg">{MONTH_YEAR.format(viewMonth)}</span>
              <button
                type="button"
                onClick={() => setViewMonth(nextMonth)}
                disabled={nextDisabled}
                aria-label="Next month"
                className="grid h-7 w-7 place-items-center rounded text-fg-muted transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 0-1.06L10.94 10 7.21 6.29a.75.75 0 1 1 1.06-1.06l4.25 4.24a.75.75 0 0 1 0 1.06l-4.25 4.24a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Plain buttons rather than an ARIA grid: each day already carries
                its full date as a label, and a half-built grid role reads worse
                than none. */}
            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((d, i) => (
                <div
                  key={`${d}-${i}`}
                  className="grid h-7 place-items-center text-[11px] font-semibold uppercase text-fg-subtle"
                  aria-hidden="true"
                >
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const inMonth = day.getMonth() === viewMonth.getMonth();
                const selectable = isDaySelectable(day, min, max);
                const isSelected = Boolean(selected && isSameDay(day, selected));
                const isToday = isSameDay(day, today);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    disabled={!selectable}
                    aria-current={isSelected ? "date" : undefined}
                    aria-label={FULL_DATE.format(day)}
                    onClick={() => selectDay(day)}
                    className={cn(
                      "grid h-8 place-items-center rounded text-sm tabular-nums transition-colors",
                      !selectable && "cursor-not-allowed text-fg-subtle/35 line-through",
                      selectable && !isSelected && inMonth && "text-fg hover:bg-raised",
                      selectable && !isSelected && !inMonth && "text-fg-subtle hover:bg-raised",
                      isSelected && "bg-accent font-semibold text-accent-ink hover:opacity-90",
                      !isSelected && isToday && selectable && "ring-1 ring-inset ring-line-strong",
                    )}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <span className="text-xs font-medium text-fg-subtle">Time</span>
              <select
                aria-label={`${label} hour`}
                value={selected ? selected.getHours() : 0}
                onChange={(e) => setTime(Number(e.target.value), selected?.getMinutes() ?? 0)}
                className="rounded border border-line bg-card px-1.5 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h} disabled={!hourEnabled(h)}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
              <select
                aria-label={`${label} minute`}
                value={selected ? selected.getMinutes() : 0}
                onChange={(e) => setTime(selected?.getHours() ?? 0, Number(e.target.value))}
                className="rounded border border-line bg-card px-1.5 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {Array.from({ length: 60 }, (_, m) => (
                  <option key={m} value={m} disabled={!minuteEnabled(m)}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  // "Latest" is the newest instant this field allows, which is
                  // now for the end field and a minute before it for the start.
                  if (max) commit(max);
                  setOpen(false);
                }}
                className="ml-auto rounded px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
              >
                Latest
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

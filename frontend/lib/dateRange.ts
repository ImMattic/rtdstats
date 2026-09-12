/**
 * Local-time helpers for the Trip Explorer's date range.
 *
 * Everything here speaks the same string shape an `<input type="datetime-local">`
 * carries — `"YYYY-MM-DDTHH:mm"`, interpreted in the browser's zone — which is
 * what `DateRangePicker` (the only consumer) is built entirely out of.
 *
 * The two load-bearing exports are `rangeBounds`, which turns the server's
 * request limits (see /api/v1/meta/limits) into a concrete min/max for the
 * start and end fields so the calendar can grey out days that would be
 * rejected instead of letting someone pick them and read an error afterwards,
 * and `presetRange`, which does the same arithmetic for the picker's "Last N
 * hours" quick-range buttons.
 */

/** Minute resolution — the finest granularity a datetime-local value carries. */
export const MINUTE_MS = 60_000;

/** Server-side caps the pickers have to respect. */
export interface RangeLimits {
  /** Widest `end - start` the /vehicles/active endpoint accepts. */
  maxSpanHours: number;
  /** How far back raw rows still exist (the hypertable retention policy). */
  retentionDays: number;
}

/**
 * Used until /api/v1/meta/limits answers, and if it never does. Kept in step with
 * `vehicles_max_span_hours` / `data_retention_days` in backend/app/config.py.
 */
export const DEFAULT_RANGE_LIMITS: RangeLimits = {
  maxSpanHours: 72,
  retentionDays: 365,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** `Date` → `"YYYY-MM-DDTHH:mm"` in local time. */
export function toLocalInput(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** `"YYYY-MM-DDTHH:mm"` → `Date` in local time, or null if unparseable. */
export function fromLocalInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    0,
    0,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** An ISO instant → the local datetime-local string that represents it. */
export function isoToLocalInput(iso: string): string {
  return toLocalInput(new Date(iso));
}

/** A local datetime-local string → a UTC ISO instant, or null if unparseable. */
export function localInputToIso(value: string): string | null {
  return fromLocalInput(value)?.toISOString() ?? null;
}

/** Local midnight of `d`'s calendar day. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The last representable minute of `d`'s calendar day (23:59 local). */
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes());
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MINUTE_MS);
}

/** Same calendar day in local time? */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Inclusive min/max for one field, as datetime-local strings. */
export interface FieldBounds {
  min: string;
  max: string;
}

export interface RangeBounds {
  start: FieldBounds;
  end: FieldBounds;
}

/**
 * The selectable window for each field, given the current range and the server's
 * limits.
 *
 * Start is bounded only by what data exists — `[now - retention, now - 1min]`. It
 * is deliberately *not* clamped against the current end: if it were, someone who
 * wanted to move the whole window back a month would find every earlier date
 * greyed out and no way to get there. Moving start re-anchors the range instead,
 * and the caller pulls end along with `clampEnd`.
 *
 * End is bounded by start: at least a minute after it, at most `maxSpanHours`
 * later, and never past now. That is the pair of rules the server enforces
 * (`start < end` and `end - start <= vehicles_max_span_hours`), so a range the
 * calendar allows is a range the API accepts.
 */
export function rangeBounds(
  startLocal: string,
  limits: RangeLimits,
  now: Date = new Date(),
): RangeBounds {
  const latest = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  const earliest = new Date(latest.getTime() - limits.retentionDays * 24 * 60 * MINUTE_MS);

  const start = fromLocalInput(startLocal) ?? addMinutes(latest, -60);
  // A start outside the data window still has to produce a sane end range, so
  // reason from where start effectively sits rather than from the raw value.
  const anchoredStart = new Date(
    Math.min(Math.max(start.getTime(), earliest.getTime()), latest.getTime() - MINUTE_MS),
  );

  const endMin = addMinutes(anchoredStart, 1);
  const endMax = new Date(
    Math.min(anchoredStart.getTime() + limits.maxSpanHours * 60 * MINUTE_MS, latest.getTime()),
  );

  return {
    start: {
      min: toLocalInput(earliest),
      max: toLocalInput(addMinutes(latest, -1)),
    },
    end: {
      min: toLocalInput(endMin),
      // Guard against endMin > endMax, which can only happen if the clock and the
      // limits disagree; an empty window would disable every day in the picker.
      max: toLocalInput(endMax.getTime() < endMin.getTime() ? endMin : endMax),
    },
  };
}

export interface LocalRange {
  start: string;
  end: string;
}

/** One "Last …" quick-range button on the combined date-range picker. */
export interface RangePreset {
  label: string;
  hours: number;
}

/**
 * The five quick ranges offered on the Trip Explorer's date-range picker.
 * "Last 3 days" only works because `vehicles_max_span_hours` (see
 * backend/app/config.py) is 72 — if that cap ever drops back below one of
 * these, `presetRange` still degrades gracefully by capping the span at
 * `limits.maxSpanHours`, it just no longer matches the button's own label.
 */
export const RANGE_PRESETS: RangePreset[] = [
  { label: "Last hour", hours: 1 },
  { label: "Last 3 hours", hours: 3 },
  { label: "Last 6 hours", hours: 6 },
  { label: "Last day", hours: 24 },
  { label: "Last 3 days", hours: 72 },
];

/**
 * The concrete `[start, end]` for a "Last N hours" preset, anchored to `now`
 * and clamped to what the server and the retention window actually allow —
 * the same two limits `rangeBounds` enforces, so a preset button can never
 * produce a range the API would reject.
 */
export function presetRange(hours: number, limits: RangeLimits, now: Date = new Date()): LocalRange {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  const earliest = new Date(end.getTime() - limits.retentionDays * 24 * 60 * MINUTE_MS);
  const span = Math.min(hours, limits.maxSpanHours) * 60 * MINUTE_MS;
  const start = new Date(Math.max(end.getTime() - span, earliest.getTime()));
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

/**
 * Whether `[startLocal, endLocal]` is exactly what the given preset currently
 * evaluates to — so the picker can highlight which quick range, if any, is
 * active rather than leaving every button unselected the instant a minute
 * ticks over.
 */
export function isPresetActive(
  startLocal: string,
  endLocal: string,
  hours: number,
  limits: RangeLimits,
  now: Date = new Date(),
): boolean {
  const preset = presetRange(hours, limits, now);
  return startLocal === preset.start && endLocal === preset.end;
}

/** Pull `value` inside `[min, max]`, returning it unchanged when already inside. */
export function clampLocal(value: string, bounds: FieldBounds): string {
  const v = fromLocalInput(value);
  const min = fromLocalInput(bounds.min);
  const max = fromLocalInput(bounds.max);
  if (!v) return bounds.min;
  if (min && v < min) return bounds.min;
  if (max && v > max) return bounds.max;
  return value;
}

/** True when `value` sits inside `[min, max]` (both inclusive). */
export function isWithin(value: Date, min: Date | null, max: Date | null): boolean {
  if (min && value.getTime() < min.getTime()) return false;
  if (max && value.getTime() > max.getTime()) return false;
  return true;
}

/**
 * True when any minute of `day`'s calendar day is selectable — i.e. the day
 * overlaps `[min, max]` at all. This is the test the calendar grid uses to decide
 * whether a date is greyed out.
 */
export function isDaySelectable(day: Date, min: Date | null, max: Date | null): boolean {
  if (min && endOfDay(day).getTime() < min.getTime()) return false;
  if (max && startOfDay(day).getTime() > max.getTime()) return false;
  return true;
}

/**
 * The 42 cells (6 weeks, Sunday-first) covering `month`, so the grid never
 * changes height as you page through months.
 */
export function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  return Array.from(
    { length: 42 },
    (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
  );
}

/** Human-readable summary of the caps, for the hint under the fields. */
export function describeLimits(limits: RangeLimits): string {
  const span =
    limits.maxSpanHours % 24 === 0
      ? `${limits.maxSpanHours / 24} day${limits.maxSpanHours === 24 ? "" : "s"}`
      : `${limits.maxSpanHours} hours`;
  return `Ranges span at most ${span}, within the last ${limits.retentionDays} days.`;
}

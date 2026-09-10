// ── Trip Explorer filter model ──────────────────────────────────────────────
// The trips table is paginated server-side, so these filters have to travel to
// the API rather than being applied to the page that came back — filtering a
// single page would silently hide matches sitting on page 2. Everything here is
// pure: state → query params → URL, and back again.

import type { TransitMode } from "@/lib/mapFilters";
import { occupancyLabel, type TripStatus } from "@/lib/utils";

export interface TripFilters {
  modes: TransitMode[];
  routeIds: string[];
  /** Fleet numbers (`vehicle_label`), which is what the table shows. */
  vehicleLabels: string[];
  statuses: TripStatus[];
  /** Last reported occupancy on the trip; "UNKNOWN" for trips that never said. */
  occupancy: string[];
  minDurationMinutes: number | null;
  maxDurationMinutes: number | null;
  /** Only trips lying entirely inside the window, rather than merely touching it. */
  strict: boolean;
}

export const EMPTY_TRIP_FILTERS: TripFilters = {
  modes: [],
  routeIds: [],
  vehicleLabels: [],
  statuses: [],
  occupancy: [],
  minDurationMinutes: null,
  maxDurationMinutes: null,
  strict: false,
};

export const TRIP_STATUS_VALUES: TripStatus[] = ["in_progress", "complete", "incomplete"];
const MODE_VALUES: TransitMode[] = ["rail", "bus", "other"];

/** Filter groups currently narrowing the list — what the "More filters" badge shows. */
export function countActiveTripFilters(f: TripFilters): number {
  return (
    (f.modes.length > 0 ? 1 : 0) +
    (f.routeIds.length > 0 ? 1 : 0) +
    (f.vehicleLabels.length > 0 ? 1 : 0) +
    (f.statuses.length > 0 ? 1 : 0) +
    (f.occupancy.length > 0 ? 1 : 0) +
    (f.minDurationMinutes !== null || f.maxDurationMinutes !== null ? 1 : 0) +
    (f.strict ? 1 : 0)
  );
}

export function tripFiltersActive(f: TripFilters): boolean {
  return countActiveTripFilters(f) > 0;
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Read a filter set out of the page URL. Unknown values are dropped rather than
 * passed through, so a hand-edited link can't push a status the API will reject.
 */
export function tripFiltersFromParams(params: URLSearchParams): TripFilters {
  const modes = parseList(params.get("modes")).filter((m): m is TransitMode =>
    (MODE_VALUES as string[]).includes(m),
  );
  const statuses = parseList(params.get("status")).filter((s): s is TripStatus =>
    (TRIP_STATUS_VALUES as string[]).includes(s),
  );
  // `route_id` is the original single-route param — still honoured so older
  // links (and the breadcrumb back from a trip page) keep working.
  const legacyRoute = params.get("route_id");
  const routeIds = parseList(params.get("routes"));
  if (legacyRoute && !routeIds.includes(legacyRoute)) routeIds.unshift(legacyRoute);

  return {
    modes,
    routeIds,
    vehicleLabels: parseList(params.get("vehicles")),
    statuses,
    occupancy: parseList(params.get("occupancy")),
    minDurationMinutes: parseNumber(params.get("min_duration")),
    maxDurationMinutes: parseNumber(params.get("max_duration")),
    strict: params.get("strict") === "true",
  };
}

/** The filter half of the page URL — merge into a `URLSearchParams` with start/end. */
export function tripFiltersToParams(f: TripFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.modes.length) out.modes = f.modes.join(",");
  if (f.routeIds.length) out.routes = f.routeIds.join(",");
  if (f.vehicleLabels.length) out.vehicles = f.vehicleLabels.join(",");
  if (f.statuses.length) out.status = f.statuses.join(",");
  if (f.occupancy.length) out.occupancy = f.occupancy.join(",");
  if (f.minDurationMinutes !== null) out.min_duration = String(f.minDurationMinutes);
  if (f.maxDurationMinutes !== null) out.max_duration = String(f.maxDurationMinutes);
  if (f.strict) out.strict = "true";
  return out;
}

/** The same set shaped for `fetchActiveVehicles`. */
export function tripFiltersToQuery(f: TripFilters) {
  return {
    modes: f.modes.length ? f.modes.join(",") : undefined,
    route_ids: f.routeIds.length ? f.routeIds.join(",") : undefined,
    vehicle_labels: f.vehicleLabels.length ? f.vehicleLabels.join(",") : undefined,
    status: f.statuses.length ? f.statuses.join(",") : undefined,
    occupancy: f.occupancy.length ? f.occupancy.join(",") : undefined,
    min_duration_minutes: f.minDurationMinutes ?? undefined,
    max_duration_minutes: f.maxDurationMinutes ?? undefined,
    strict: f.strict,
  };
}

// ── Applied-filter summary ──────────────────────────────────────────────────

const STATUS_TEXT: Record<TripStatus, string> = {
  in_progress: "In progress",
  complete: "Complete",
  incomplete: "Incomplete",
};

const MODE_TEXT: Record<TransitMode, string> = {
  rail: "Rail",
  bus: "Bus",
  other: "Other",
};

export interface TripFilterChip {
  id: string;
  label: string;
  /** The same filter set with this one condition lifted. */
  next: TripFilters;
}

/**
 * One removable chip per applied condition, so what's narrowing the table stays
 * visible after the menu is closed. `routeName` turns a route_id into what the
 * table calls it; ids the caller can't name fall back to the id itself.
 */
export function tripFilterChips(
  f: TripFilters,
  routeName: (routeId: string) => string | undefined,
): TripFilterChip[] {
  const chips: TripFilterChip[] = [];
  type ListKey = "statuses" | "modes" | "routeIds" | "vehicleLabels" | "occupancy";
  const without = (key: ListKey, value: string): TripFilters =>
    ({ ...f, [key]: (f[key] as string[]).filter((v) => v !== value) }) as TripFilters;

  for (const s of f.statuses) {
    chips.push({ id: `status:${s}`, label: STATUS_TEXT[s], next: without("statuses", s) });
  }
  for (const m of f.modes) {
    chips.push({ id: `mode:${m}`, label: MODE_TEXT[m], next: without("modes", m) });
  }
  for (const r of f.routeIds) {
    chips.push({
      id: `route:${r}`,
      label: `Route ${routeName(r) ?? r}`,
      next: without("routeIds", r),
    });
  }
  for (const v of f.vehicleLabels) {
    chips.push({ id: `vehicle:${v}`, label: `#${v}`, next: without("vehicleLabels", v) });
  }
  for (const o of f.occupancy) {
    chips.push({ id: `occupancy:${o}`, label: occupancyLabel(o), next: without("occupancy", o) });
  }
  if (f.minDurationMinutes !== null || f.maxDurationMinutes !== null) {
    const { minDurationMinutes: lo, maxDurationMinutes: hi } = f;
    const label =
      lo !== null && hi !== null
        ? `${lo}–${hi} min`
        : lo !== null
          ? `Over ${lo} min`
          : `Under ${hi} min`;
    chips.push({
      id: "duration",
      label,
      next: { ...f, minDurationMinutes: null, maxDurationMinutes: null },
    });
  }
  if (f.strict) {
    chips.push({ id: "strict", label: "Whole trips only", next: { ...f, strict: false } });
  }
  return chips;
}

/** Deep-ish equality, so the Apply button can tell a real edit from a no-op. */
export function tripFiltersEqual(a: TripFilters, b: TripFilters): boolean {
  const sameList = (x: string[], y: string[]) =>
    x.length === y.length && x.every((v, i) => v === y[i]);
  return (
    sameList(a.modes, b.modes) &&
    sameList(a.routeIds, b.routeIds) &&
    sameList(a.vehicleLabels, b.vehicleLabels) &&
    sameList(a.statuses, b.statuses) &&
    sameList(a.occupancy, b.occupancy) &&
    a.minDurationMinutes === b.minDurationMinutes &&
    a.maxDurationMinutes === b.maxDurationMinutes &&
    a.strict === b.strict
  );
}

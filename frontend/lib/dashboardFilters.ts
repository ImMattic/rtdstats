// ── Dashboard filter model ──────────────────────────────────────────────────
// The Dashboard's analytics endpoints filter by a set of route_ids (and mode
// quick-selects, which the API resolves to route_ids server-side). Everything
// here is pure: state → query params, plus the client-side mode→route expansion
// the page needs to decide which single-route-only cards to show.

import type { RouteInfo } from "@/lib/types";

/** Mode quick-selects — values match the backend's `modes` param vocabulary. */
export type DashboardMode = "bus" | "light_rail" | "commuter_rail";

export const DASHBOARD_MODES: DashboardMode[] = ["bus", "light_rail", "commuter_rail"];

export const DASHBOARD_MODE_LABELS: Record<DashboardMode, string> = {
  bus: "Bus",
  light_rail: "Light rail",
  commuter_rail: "Commuter rail",
};

export interface DashboardFilters {
  routeIds: string[];
  modes: DashboardMode[];
}

export const EMPTY_DASHBOARD_FILTERS: DashboardFilters = { routeIds: [], modes: [] };

/** How many filter groups are narrowing the dashboard — the button badge. */
export function countActiveDashboardFilters(f: DashboardFilters): number {
  return (f.routeIds.length > 0 ? 1 : 0) + (f.modes.length > 0 ? 1 : 0);
}

export function dashboardFiltersActive(f: DashboardFilters): boolean {
  return countActiveDashboardFilters(f) > 0;
}

/** Order-insensitive equality, so Apply can tell a real edit from a no-op. */
export function dashboardFiltersEqual(a: DashboardFilters, b: DashboardFilters): boolean {
  const sameList = (x: string[], y: string[]) => {
    if (x.length !== y.length) return false;
    const s = new Set(x);
    return y.every((v) => s.has(v));
  };
  return sameList(a.routeIds, b.routeIds) && sameList(a.modes, b.modes);
}

/**
 * The concrete set of routes a filter resolves to, expanding each mode
 * quick-select against the static route list and unioning with the explicit
 * picks. Empty means "the whole system". The page reads the length of this to
 * decide whether the single-route cards (scheduled frequency, crowding-by-hour)
 * can be shown.
 */
export function resolveDashboardRouteIds(
  f: DashboardFilters,
  routes: Pick<RouteInfo, "route_id" | "type_name">[],
): string[] {
  const ids = new Set(f.routeIds);
  if (f.modes.length) {
    const modes: string[] = f.modes;
    for (const r of routes) {
      if (modes.includes(r.type_name)) ids.add(r.route_id);
    }
  }
  return [...ids];
}

// ── Query params ────────────────────────────────────────────────────────────

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function dashboardFiltersToQuery(f: DashboardFilters): {
  route_ids: string | undefined;
  modes: string | undefined;
} {
  return {
    route_ids: f.routeIds.length ? f.routeIds.join(",") : undefined,
    modes: f.modes.length ? f.modes.join(",") : undefined,
  };
}

/** Read a filter set out of URL params (legacy single `route_id` still honoured). */
export function dashboardFiltersFromParams(params: URLSearchParams): DashboardFilters {
  const routeIds = parseList(params.get("routes"));
  const legacy = params.get("route_id");
  if (legacy && !routeIds.includes(legacy)) routeIds.unshift(legacy);
  const modes = parseList(params.get("modes")).filter((m): m is DashboardMode =>
    (DASHBOARD_MODES as string[]).includes(m),
  );
  return { routeIds, modes };
}

// ── Applied-filter chips ────────────────────────────────────────────────────

export interface DashboardFilterChip {
  id: string;
  label: string;
  /** The same set with this one condition lifted. */
  next: DashboardFilters;
}

export function dashboardFilterChips(
  f: DashboardFilters,
  routeName: (routeId: string) => string | undefined,
): DashboardFilterChip[] {
  const chips: DashboardFilterChip[] = [];
  for (const m of f.modes) {
    chips.push({
      id: `mode:${m}`,
      label: DASHBOARD_MODE_LABELS[m],
      next: { ...f, modes: f.modes.filter((v) => v !== m) },
    });
  }
  for (const r of f.routeIds) {
    chips.push({
      id: `route:${r}`,
      label: `Route ${routeName(r) ?? r}`,
      next: { ...f, routeIds: f.routeIds.filter((v) => v !== r) },
    });
  }
  return chips;
}

import { describe, it, expect } from "vitest";
import {
  EMPTY_DASHBOARD_FILTERS,
  countActiveDashboardFilters,
  dashboardFilterChips,
  dashboardFiltersEqual,
  dashboardFiltersFromParams,
  dashboardFiltersToQuery,
  resolveDashboardRouteIds,
  type DashboardFilters,
} from "@/lib/dashboardFilters";
import type { RouteInfo } from "@/lib/types";

const ROUTES = [
  { route_id: "r15", type_name: "bus" },
  { route_id: "r0", type_name: "bus" },
  { route_id: "rE", type_name: "light_rail" },
  { route_id: "rN", type_name: "commuter_rail" },
] as Pick<RouteInfo, "route_id" | "type_name">[];

describe("countActiveDashboardFilters", () => {
  it("counts each non-empty group once", () => {
    expect(countActiveDashboardFilters(EMPTY_DASHBOARD_FILTERS)).toBe(0);
    expect(countActiveDashboardFilters({ routeIds: ["r15"], modes: [] })).toBe(1);
    expect(countActiveDashboardFilters({ routeIds: ["r15"], modes: ["bus"] })).toBe(2);
  });
});

describe("dashboardFiltersEqual", () => {
  it("is order-insensitive", () => {
    expect(
      dashboardFiltersEqual(
        { routeIds: ["a", "b"], modes: ["bus"] },
        { routeIds: ["b", "a"], modes: ["bus"] },
      ),
    ).toBe(true);
  });
  it("distinguishes a real edit", () => {
    expect(
      dashboardFiltersEqual({ routeIds: ["a"], modes: [] }, { routeIds: ["a", "b"], modes: [] }),
    ).toBe(false);
  });
});

describe("resolveDashboardRouteIds", () => {
  it("returns explicit picks as-is", () => {
    expect(resolveDashboardRouteIds({ routeIds: ["r15"], modes: [] }, ROUTES)).toEqual(["r15"]);
  });
  it("expands a mode against the static list", () => {
    expect(
      resolveDashboardRouteIds({ routeIds: [], modes: ["bus"] }, ROUTES).sort(),
    ).toEqual(["r0", "r15"]);
  });
  it("unions modes with explicit picks, deduped", () => {
    expect(
      resolveDashboardRouteIds({ routeIds: ["r15", "rE"], modes: ["bus"] }, ROUTES).sort(),
    ).toEqual(["r0", "r15", "rE"]);
  });
  it("is empty for no filter (whole system)", () => {
    expect(resolveDashboardRouteIds(EMPTY_DASHBOARD_FILTERS, ROUTES)).toEqual([]);
  });
});

describe("dashboardFiltersToQuery", () => {
  it("joins lists and omits empties", () => {
    expect(dashboardFiltersToQuery({ routeIds: ["a", "b"], modes: [] })).toEqual({
      route_ids: "a,b",
      modes: undefined,
    });
  });
});

describe("dashboardFiltersFromParams", () => {
  it("reads routes + modes csv and drops unknown modes", () => {
    const f = dashboardFiltersFromParams(new URLSearchParams("routes=a,b&modes=bus,monorail"));
    expect(f.routeIds).toEqual(["a", "b"]);
    expect(f.modes).toEqual(["bus"]);
  });
  it("honours a legacy single route_id", () => {
    const f = dashboardFiltersFromParams(new URLSearchParams("route_id=r15"));
    expect(f.routeIds).toEqual(["r15"]);
  });
});

describe("dashboardFilterChips", () => {
  it("emits a removable chip per condition, each lifting only itself", () => {
    const f: DashboardFilters = { routeIds: ["r15"], modes: ["bus"] };
    const chips = dashboardFilterChips(f, (id) => (id === "r15" ? "15" : undefined));
    expect(chips.map((c) => c.label)).toEqual(["Bus", "Route 15"]);
    const busChip = chips.find((c) => c.id === "mode:bus")!;
    expect(busChip.next).toEqual({ routeIds: ["r15"], modes: [] });
  });
});

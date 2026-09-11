import { describe, it, expect } from "vitest";
import {
  EMPTY_TRIP_FILTERS,
  countActiveTripFilters,
  tripFilterChips,
  tripFiltersEqual,
  tripFiltersFromParams,
  tripFiltersToParams,
  tripFiltersToQuery,
  type TripFilters,
} from "@/lib/tripFilters";

const filters = (overrides: Partial<TripFilters> = {}): TripFilters => ({
  ...EMPTY_TRIP_FILTERS,
  ...overrides,
});

describe("tripFiltersFromParams", () => {
  it("reads every group out of a query string", () => {
    const f = tripFiltersFromParams(
      new URLSearchParams(
        "modes=rail,bus&routes=E,15&vehicles=1001&status=complete&occupancy=FULL&min_duration=10&max_duration=45&min_avg_delay=-60&max_avg_delay=300&min_on_time=50&max_on_time=90&strict=true",
      ),
    );
    expect(f).toEqual({
      modes: ["rail", "bus"],
      routeIds: ["E", "15"],
      vehicleLabels: ["1001"],
      statuses: ["complete"],
      occupancy: ["FULL"],
      minDurationMinutes: 10,
      maxDurationMinutes: 45,
      minAvgDelaySeconds: -60,
      maxAvgDelaySeconds: 300,
      minOnTimePct: 50,
      maxOnTimePct: 90,
      strict: true,
    });
  });

  it("reads a negative avg-delay bound, unlike duration which can't go negative", () => {
    const f = tripFiltersFromParams(new URLSearchParams("min_avg_delay=-120"));
    expect(f.minAvgDelaySeconds).toBe(-120);
  });

  it("drops values the API would reject rather than passing them through", () => {
    const f = tripFiltersFromParams(
      new URLSearchParams("modes=rail,ferry&status=complete,exploded&min_duration=-4"),
    );
    expect(f.modes).toEqual(["rail"]);
    expect(f.statuses).toEqual(["complete"]);
    expect(f.minDurationMinutes).toBeNull();
  });

  it("still honours the original single-route param", () => {
    expect(tripFiltersFromParams(new URLSearchParams("route_id=15")).routeIds).toEqual(["15"]);
    // …without duplicating a route the newer param already named.
    expect(
      tripFiltersFromParams(new URLSearchParams("route_id=15&routes=15,E")).routeIds,
    ).toEqual(["15", "E"]);
  });

  it("returns an empty set for a bare URL", () => {
    expect(tripFiltersFromParams(new URLSearchParams(""))).toEqual(EMPTY_TRIP_FILTERS);
  });
});

describe("tripFiltersToParams", () => {
  it("round-trips through the URL", () => {
    const f = filters({
      modes: ["bus"],
      routeIds: ["15"],
      vehicleLabels: ["1001", "1002"],
      statuses: ["in_progress"],
      occupancy: ["EMPTY"],
      minDurationMinutes: 5,
      maxDurationMinutes: 90,
      minAvgDelaySeconds: -90,
      maxAvgDelaySeconds: 600,
      minOnTimePct: 60,
      maxOnTimePct: 95,
      strict: true,
    });
    const params = new URLSearchParams(tripFiltersToParams(f));
    expect(tripFiltersFromParams(params)).toEqual(f);
  });

  it("writes nothing for a group that isn't set", () => {
    expect(tripFiltersToParams(EMPTY_TRIP_FILTERS)).toEqual({});
  });

  it("leaves the API query undefined where the URL is silent", () => {
    const q = tripFiltersToQuery(filters({ routeIds: ["15", "E"] }));
    expect(q.route_ids).toBe("15,E");
    expect(q.status).toBeUndefined();
    expect(q.min_duration_minutes).toBeUndefined();
    expect(q.strict).toBe(false);
  });
});

describe("countActiveTripFilters", () => {
  it("counts one per group, with duration as a single condition", () => {
    expect(countActiveTripFilters(EMPTY_TRIP_FILTERS)).toBe(0);
    expect(
      countActiveTripFilters(
        filters({ minDurationMinutes: 10, maxDurationMinutes: 40, strict: true }),
      ),
    ).toBe(2);
    expect(countActiveTripFilters(filters({ routeIds: ["A", "B", "C"] }))).toBe(1);
  });

  it("counts avg delay and on-time as one condition each, same as duration", () => {
    expect(
      countActiveTripFilters(filters({ minAvgDelaySeconds: -60, maxAvgDelaySeconds: 300 })),
    ).toBe(1);
    expect(countActiveTripFilters(filters({ minOnTimePct: 80 }))).toBe(1);
  });
});

describe("tripFilterChips", () => {
  const routeName = (id: string) => (id === "r-15" ? "15" : undefined);

  it("names each applied condition and hands back the set without it", () => {
    const f = filters({ statuses: ["incomplete"], routeIds: ["r-15"], strict: true });
    const chips = tripFilterChips(f, routeName);
    expect(chips.map((c) => c.label)).toEqual(["Incomplete", "Route 15", "Whole trips only"]);
    expect(chips[1].next.routeIds).toEqual([]);
    expect(chips[1].next.statuses).toEqual(["incomplete"]);
    expect(chips[2].next.strict).toBe(false);
  });

  it("falls back to the route id when the window has no name for it", () => {
    const chips = tripFilterChips(filters({ routeIds: ["r-999"] }), routeName);
    expect(chips[0].label).toBe("Route r-999");
  });

  it("collapses a duration range into one chip", () => {
    expect(
      tripFilterChips(filters({ minDurationMinutes: 15, maxDurationMinutes: 45 }), routeName)[0]
        .label,
    ).toBe("15–45 min");
    expect(
      tripFilterChips(filters({ minDurationMinutes: 15 }), routeName)[0].label,
    ).toBe("Over 15 min");
    expect(
      tripFilterChips(filters({ maxDurationMinutes: 45 }), routeName)[0].label,
    ).toBe("Under 45 min");
  });

  it("says nothing when nothing is applied", () => {
    expect(tripFilterChips(EMPTY_TRIP_FILTERS, routeName)).toEqual([]);
  });

  it("collapses an avg-delay range into one chip, signed values and all", () => {
    expect(
      tripFilterChips(
        filters({ minAvgDelaySeconds: -60, maxAvgDelaySeconds: 300 }),
        routeName,
      )[0].label,
    ).toBe("Avg delay -1.0m to +5.0m");
    expect(
      tripFilterChips(filters({ minAvgDelaySeconds: 300 }), routeName)[0].label,
    ).toBe("Avg delay at least +5.0m");
    expect(
      tripFilterChips(filters({ maxAvgDelaySeconds: -60 }), routeName)[0].label,
    ).toBe("Avg delay at most -1.0m");
  });

  it("collapses an on-time range into one chip", () => {
    expect(
      tripFilterChips(filters({ minOnTimePct: 60, maxOnTimePct: 90 }), routeName)[0].label,
    ).toBe("On-time 60–90%");
    expect(
      tripFilterChips(filters({ minOnTimePct: 80 }), routeName)[0].label,
    ).toBe("On-time 80%+");
  });
});

describe("tripFiltersEqual", () => {
  it("separates a real edit from a no-op", () => {
    expect(tripFiltersEqual(EMPTY_TRIP_FILTERS, filters())).toBe(true);
    expect(tripFiltersEqual(filters({ strict: true }), filters())).toBe(false);
    expect(tripFiltersEqual(filters({ routeIds: ["A"] }), filters({ routeIds: ["B"] }))).toBe(
      false,
    );
  });
});

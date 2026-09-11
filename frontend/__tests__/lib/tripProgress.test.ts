import { describe, it, expect, vi, afterEach } from "vitest";
import { isTripInProgress } from "@/lib/utils";
import type { VehiclePosition } from "@/lib/types";

// A live feed carrying one rail vehicle. RTD labels rail with a run number
// (1-99, reused every service day) rather than a fleet number, and a GTFS trip
// id is reused for the life of the bundle — so this exact pair recurs daily.
const FEED = [
  { vehicle_label: "11", trip_id: "115906205" },
] as unknown as VehiclePosition[];

const NOW = new Date("2026-09-11T15:00:00Z");

function at(iso: string) {
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isTripInProgress", () => {
  it("matches a leg that is still reporting", () => {
    vi.useFakeTimers();
    at(NOW.toISOString());
    expect(
      isTripInProgress(FEED, "11", "115906205", "2026-09-11T14:59:30Z"),
    ).toBe(true);
  });

  it("rejects yesterday's run even though the feed matches exactly", () => {
    // The production bug: the pair matches, so the trip page dropped its `end`
    // bound and asked the API for a window wider than it will serve.
    vi.useFakeTimers();
    at(NOW.toISOString());
    expect(
      isTripInProgress(FEED, "11", "115906205", "2026-09-10T15:02:00Z"),
    ).toBe(false);
  });

  it("rejects a leg that finished earlier the same day", () => {
    vi.useFakeTimers();
    at(NOW.toISOString());
    expect(
      isTripInProgress(FEED, "11", "115906205", "2026-09-11T09:20:00Z"),
    ).toBe(false);
  });

  it("accepts a leg whose end bound sits slightly in the future", () => {
    // The trips list pads each leg's bounds by two minutes.
    vi.useFakeTimers();
    at(NOW.toISOString());
    expect(
      isTripInProgress(FEED, "11", "115906205", "2026-09-11T15:02:00Z"),
    ).toBe(true);
  });

  it("falls back to the feed match when no leg end is known", () => {
    expect(isTripInProgress(FEED, "11", "115906205")).toBe(true);
  });

  it("requires both label and trip id to match", () => {
    expect(isTripInProgress(FEED, "12", "115906205")).toBe(false);
    expect(isTripInProgress(FEED, "11", "115906206")).toBe(false);
  });

  it("is false without a feed", () => {
    expect(isTripInProgress(undefined, "11", "115906205")).toBe(false);
  });
});

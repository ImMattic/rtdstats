import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import FrequencyTable from "@/components/dashboard/FrequencyTable";
import type { FrequencyRouteStats } from "@/lib/types";

function makeRoute(overrides?: Partial<FrequencyRouteStats>): FrequencyRouteStats {
  return {
    route_id: "R1",
    route_short_name: "15L",
    avg_headway_minutes: 12.0,
    min_headway_minutes: 10.0,
    max_headway_minutes: 15.0,
    vehicle_count: 8,
    ...overrides,
  };
}

describe("FrequencyTable", () => {
  it("renders empty state when no routes", () => {
    render(<FrequencyTable routes={[]} />);
    expect(screen.getByText(/no frequency data/i)).toBeInTheDocument();
  });

  it("renders one row per route", () => {
    const routes = [makeRoute(), makeRoute({ route_id: "R2", route_short_name: "44" })];
    render(<FrequencyTable routes={routes} />);
    // Both route short names should appear
    expect(screen.getByText("15L")).toBeInTheDocument();
    expect(screen.getByText("44")).toBeInTheDocument();
  });

  it("shows dash for zero headway", () => {
    render(<FrequencyTable routes={[makeRoute({ avg_headway_minutes: 0 })]} />);
    // Multiple "—" may appear (avg + range cells), just ensure the column is present
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("shows headway in minutes when positive", () => {
    render(<FrequencyTable routes={[makeRoute({ avg_headway_minutes: 12 })]} />);
    expect(screen.getByText("12 min")).toBeInTheDocument();
  });

  it("shows High badge for headway under 15 min", () => {
    render(<FrequencyTable routes={[makeRoute({ avg_headway_minutes: 10 })]} />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("shows Moderate badge for headway between 15–30 min", () => {
    render(<FrequencyTable routes={[makeRoute({ avg_headway_minutes: 20 })]} />);
    expect(screen.getByText("Moderate")).toBeInTheDocument();
  });

  it("shows Low badge for headway over 30 min", () => {
    render(<FrequencyTable routes={[makeRoute({ avg_headway_minutes: 45 })]} />);
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("sorts routes by avg_headway ascending", () => {
    const routes = [
      makeRoute({ route_id: "R2", route_short_name: "44", avg_headway_minutes: 30 }),
      makeRoute({ route_id: "R1", route_short_name: "15L", avg_headway_minutes: 10 }),
    ];
    render(<FrequencyTable routes={routes} />);
    const rows = screen.getAllByRole("row");
    // Row 0 is the header; row 1 should be the route with smaller headway
    expect(within(rows[1]).getByText("15L")).toBeInTheDocument();
    expect(within(rows[2]).getByText("44")).toBeInTheDocument();
  });
});

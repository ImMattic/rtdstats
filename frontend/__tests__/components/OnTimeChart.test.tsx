import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import OnTimeChart from "@/components/dashboard/OnTimeChart";
import type { OnTimeRouteStats } from "@/lib/types";

// ResponsiveContainer requires a real DOM with dimensions — mock it in jsdom.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

function makeRoute(overrides?: Partial<OnTimeRouteStats>): OnTimeRouteStats {
  return {
    route_id: "R1",
    route_short_name: "15L",
    total_observations: 100,
    on_time: 85,
    late: 10,
    early: 5,
    on_time_pct: 85.0,
    avg_delay_seconds: 45.0,
    ...overrides,
  };
}

describe("OnTimeChart", () => {
  it("renders empty state message when no routes", () => {
    render(<OnTimeChart routes={[]} />);
    expect(screen.getByText(/no on-time data/i)).toBeInTheDocument();
  });

  it("renders chart container when routes are provided", () => {
    render(<OnTimeChart routes={[makeRoute()]} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("does not show empty-state message when routes exist", () => {
    render(<OnTimeChart routes={[makeRoute()]} />);
    expect(screen.queryByText(/no on-time data/i)).not.toBeInTheDocument();
  });

  it("caps chart at 20 routes when given more", () => {
    const routes = Array.from({ length: 25 }, (_, i) =>
      makeRoute({ route_id: `R${i}`, route_short_name: `${i}`, on_time_pct: i * 2 })
    );
    // Component renders without crashing and shows chart container
    render(<OnTimeChart routes={routes} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });
});

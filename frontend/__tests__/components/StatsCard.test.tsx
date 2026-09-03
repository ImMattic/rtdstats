import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatsCard from "@/components/dashboard/StatsCard";

describe("StatsCard", () => {
  it("renders title and value", () => {
    render(<StatsCard title="On-Time Rate" value="85%" />);
    expect(screen.getByText("On-Time Rate")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("renders numeric value", () => {
    render(<StatsCard title="Total Vehicles" value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(<StatsCard title="Avg Delay" value="30s" subtitle="last 7 days" />);
    expect(screen.getByText("last 7 days")).toBeInTheDocument();
  });

  it("omits subtitle element when not provided", () => {
    render(<StatsCard title="Avg Delay" value="30s" />);
    expect(screen.queryByText("last 7 days")).not.toBeInTheDocument();
  });

  it("applies green (on-time) accent class", () => {
    render(<StatsCard title="Rate" value="85%" accent="green" />);
    const valueEl = screen.getByText("85%");
    expect(valueEl.className).toMatch(/text-ok/);
  });

  it("applies red (critical) accent class", () => {
    render(<StatsCard title="Rate" value="50%" accent="red" />);
    const valueEl = screen.getByText("50%");
    expect(valueEl.className).toMatch(/text-danger/);
  });

  it("applies default foreground token when no accent provided", () => {
    render(<StatsCard title="Rate" value="75%" />);
    const valueEl = screen.getByText("75%");
    expect(valueEl.className).toMatch(/text-fg\b/);
  });
});

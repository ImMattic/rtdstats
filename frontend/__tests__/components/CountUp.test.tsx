import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CountUp from "@/components/ui/CountUp";

describe("CountUp", () => {
  beforeEach(() => {
    // Force the reduced-motion path so the value settles synchronously.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  });

  it("renders the final formatted value", () => {
    render(<CountUp value={82.4} format={(n) => `${n.toFixed(1)}%`} />);
    expect(screen.getByText("82.4%")).toBeInTheDocument();
  });

  it("rounds to an integer by default", () => {
    render(<CountUp value={37} />);
    expect(screen.getByText("37")).toBeInTheDocument();
  });
});

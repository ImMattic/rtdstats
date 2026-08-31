import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TransitLoader from "@/components/ui/TransitLoader";

describe("TransitLoader", () => {
  it("renders the default label", () => {
    render(<TransitLoader />);
    expect(screen.getByText("Loading live transit data")).toBeInTheDocument();
  });

  it("renders a custom label and the wordmark", () => {
    render(<TransitLoader label="Loading trips" />);
    expect(screen.getByText("Loading trips")).toBeInTheDocument();
    expect(screen.getByText("stats")).toBeInTheDocument();
  });
});

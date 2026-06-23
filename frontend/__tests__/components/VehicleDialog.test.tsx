import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VehicleDialog from "@/components/map/VehicleDialog";
import type { VehiclePosition } from "@/lib/types";

function makeVehicle(overrides?: Partial<VehiclePosition>): VehiclePosition {
  return {
    vehicle_id: "V1",
    vehicle_label: "101",
    trip_id: "T1",
    route_id: "R1",
    route_short_name: "15L",
    route_long_name: "East Colfax Local",
    route_color: "003DA5",
    route_type: "3",
    latitude: 39.7392,
    longitude: -104.9903,
    bearing: 90,
    current_stop_sequence: 5,
    current_status: 2,
    current_status_label: "IN_TRANSIT_TO",
    stop_id: "S1",
    stop_name: "Colfax & Broadway",
    occupancy_status: null,
    timestamp: "2026-06-20T12:00:00Z",
    delay_seconds: null,
    is_late: null,
    headway_minutes: 12.0,
    ...overrides,
  };
}

describe("VehicleDialog", () => {
  it("renders route short name in header", () => {
    render(<VehicleDialog vehicle={makeVehicle()} onClose={() => {}} />);
    expect(screen.getByText("15L")).toBeInTheDocument();
  });

  it("renders vehicle label in header", () => {
    render(<VehicleDialog vehicle={makeVehicle()} onClose={() => {}} />);
    expect(screen.getByText(/#101/)).toBeInTheDocument();
  });

  it("renders route long name in header", () => {
    render(<VehicleDialog vehicle={makeVehicle()} onClose={() => {}} />);
    expect(screen.getByText("East Colfax Local")).toBeInTheDocument();
  });

  it("shows On time badge when delay is small", () => {
    render(<VehicleDialog vehicle={makeVehicle({ delay_seconds: 60 })} onClose={() => {}} />);
    expect(screen.getByText("On time")).toBeInTheDocument();
  });

  it("shows Late badge when delay > 300s", () => {
    render(<VehicleDialog vehicle={makeVehicle({ delay_seconds: 400 })} onClose={() => {}} />);
    expect(screen.getByText("Late")).toBeInTheDocument();
  });

  it("shows Early badge when delay < -300s", () => {
    render(<VehicleDialog vehicle={makeVehicle({ delay_seconds: -400 })} onClose={() => {}} />);
    expect(screen.getByText("Early")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<VehicleDialog vehicle={makeVehicle()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows stop name when present", () => {
    render(<VehicleDialog vehicle={makeVehicle({ stop_name: "Union Station" })} onClose={() => {}} />);
    expect(screen.getByText("Union Station")).toBeInTheDocument();
  });

  it("falls back to stop_id when stop_name is null", () => {
    render(<VehicleDialog vehicle={makeVehicle({ stop_name: null, stop_id: "S99" })} onClose={() => {}} />);
    expect(screen.getByText("S99")).toBeInTheDocument();
  });

  it("shows headway when present", () => {
    render(<VehicleDialog vehicle={makeVehicle({ headway_minutes: 12 })} onClose={() => {}} />);
    expect(screen.getByText(/12 min/)).toBeInTheDocument();
  });

  it("omits headway section when null", () => {
    render(<VehicleDialog vehicle={makeVehicle({ headway_minutes: null })} onClose={() => {}} />);
    expect(screen.queryByText(/Scheduled headway/)).not.toBeInTheDocument();
  });

  it("shows occupancy when not UNKNOWN", () => {
    render(
      <VehicleDialog vehicle={makeVehicle({ occupancy_status: "MANY_SEATS_AVAILABLE" })} onClose={() => {}} />
    );
    expect(screen.getByText(/MANY SEATS AVAILABLE/i)).toBeInTheDocument();
  });

  it("omits occupancy when null", () => {
    render(<VehicleDialog vehicle={makeVehicle({ occupancy_status: null })} onClose={() => {}} />);
    expect(screen.queryByText(/Occupancy/)).not.toBeInTheDocument();
  });

  it("omits occupancy when UNKNOWN", () => {
    render(<VehicleDialog vehicle={makeVehicle({ occupancy_status: "UNKNOWN" })} onClose={() => {}} />);
    expect(screen.queryByText(/Occupancy/)).not.toBeInTheDocument();
  });
});

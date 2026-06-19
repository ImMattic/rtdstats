"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useVehicles } from "@/lib/hooks";
import type { VehiclePosition } from "@/lib/types";
import VehicleDialog from "@/components/map/VehicleDialog";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { headwayColor } from "@/lib/utils";

// Leaflet must be loaded client-side only
const VehicleMap = dynamic(() => import("@/components/map/VehicleMap"), {
  ssr: false,
  loading: () => <LoadingSpinner label="Loading map…" />,
});

export default function HomePage() {
  const { data, isLoading, isError, dataUpdatedAt } = useVehicles();
  const [selected, setSelected] = useState<VehiclePosition | null>(null);

  const handleVehicleClick = (vehicle: VehiclePosition) => {
    setSelected((prev) => {
      if (!prev) return vehicle;

      const prevKey = prev.vehicle_id ?? prev.trip_id;
      const nextKey = vehicle.vehicle_id ?? vehicle.trip_id;

      // Clicking the same vehicle again toggles the dialog closed.
      if (prevKey && nextKey && prevKey === nextKey) {
        return null;
      }

      if (
        !prevKey &&
        !nextKey &&
        prev.route_id === vehicle.route_id &&
        prev.vehicle_label &&
        vehicle.vehicle_label &&
        prev.vehicle_label === vehicle.vehicle_label
      ) {
        return null;
      }

      return vehicle;
    });
  };

  const vehicles = data?.vehicles ?? [];
  const totalRoutes = new Set(vehicles.map((v) => v.route_id)).size;

  return (
    <div className="flex flex-1 flex-col">
      {/* Status bar */}
      <div className="flex items-center justify-between bg-surface-card border-b border-surface-border px-4 py-2 text-sm text-gray-300">
        <div className="flex items-center gap-4">
          <span className="font-medium">
            {isLoading
              ? "Connecting…"
              : isError
                ? "Feed unavailable"
                : `${vehicles.length} vehicles · ${totalRoutes} routes`}
          </span>
          {data && (
            <span className="text-gray-400 text-xs">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Frequency legend */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
          <span>Headway:</span>
          {(
            [
              { label: "<15m",  color: headwayColor(10)  },
              { label: "20m",   color: headwayColor(18)  },
              { label: "30m",   color: headwayColor(25)  },
              { label: "40m",   color: headwayColor(35)  },
              { label: "50m",   color: headwayColor(45)  },
              { label: "60m+",  color: headwayColor(99)  },
            ] as const
          ).map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-full border-2"
                style={{ borderColor: color, backgroundColor: "transparent" }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="relative" style={{ height: "calc(100vh - 8rem)" }}>
        {isError ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-gray-500">
              <p className="text-lg font-medium">Backend unreachable</p>
              <p className="text-sm mt-1">Make sure the API server is running.</p>
            </div>
          </div>
        ) : (
          <VehicleMap
            vehicles={vehicles}
            onVehicleClick={handleVehicleClick}
            selectedVehicle={selected}
          />
        )}

        {/* Click-through dialog */}
        {selected && (
          <VehicleDialog vehicle={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

"use client";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useVehicles, useStopInfo, useAlerts } from "@/lib/hooks";
import type { StopInfo, StuckAlert, VehiclePosition } from "@/lib/types";
import VehicleDialog from "@/components/map/VehicleDialog";
import StopDialog from "@/components/map/StopDialog";
import MapStatusBar from "@/components/map/MapStatusBar";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

// Leaflet must be loaded client-side only
const VehicleMap = dynamic(() => import("@/components/map/VehicleMap"), {
  ssr: false,
  loading: () => <LoadingSpinner label="Loading map…" />,
});

function HomePageInner() {
  const { data, isLoading, isError, dataUpdatedAt } = useVehicles();
  const { data: alertsData } = useAlerts();
  const [selected, setSelected] = useState<VehiclePosition | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [searchFlyTo, setSearchFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const searchParams = useSearchParams();

  const { data: selectedStop } = useStopInfo(selectedStopId ?? undefined);

  const flyTo = useMemo(() => {
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    if (!lat || !lng) return null;
    return { lat: parseFloat(lat), lng: parseFloat(lng) };
  }, [searchParams]);

  const targetVehicleId = searchParams.get("vehicle_id");

  // Auto-select the vehicle referenced by the URL params once the vehicle list loads.
  useEffect(() => {
    if (!targetVehicleId || !data?.vehicles) return;
    const match = data.vehicles.find((v) => v.vehicle_id === targetVehicleId);
    if (match) setSelected(match);
  }, [targetVehicleId, data?.vehicles]);

  const handleSearchSelect = useCallback((vehicle: VehiclePosition) => {
    setSelectedStopId(null);
    setSelected(vehicle);
    if (vehicle.latitude !== null && vehicle.longitude !== null) {
      setSearchFlyTo({ lat: vehicle.latitude, lng: vehicle.longitude, zoom: 15 });
    }
  }, []);

  const handleSearchStopSelect = useCallback((stop: StopInfo) => {
    setSelected(null);
    setSelectedStopId(stop.stop_id);
    setSearchFlyTo({ lat: stop.stop_lat, lng: stop.stop_lon, zoom: 16 });
  }, []);

  // Clicking a stop marker on the map: keep the vehicle selected (so route stops
  // remain visible) but surface the stop dialog. Clicking the same stop again closes it.
  const handleMapStopClick = useCallback((stopId: string) => {
    setSelectedStopId((prev: string | null) => (prev === stopId ? null : stopId));
  }, []);

  // Stable identity so the memoized marker layer isn't rebuilt every render.
  const handleVehicleClick = useCallback((vehicle: VehiclePosition) => {
    setSelectedStopId(null);
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
  }, []);

  const vehicles = data?.vehicles ?? [];
  const totalRoutes = new Set(vehicles.map((v) => v.route_id)).size;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Status + search widget — tucked beneath the nav island; tap to cycle info */}
      <MapStatusBar
        vehicles={vehicles}
        vehicleCount={vehicles.length}
        routeCount={totalRoutes}
        isLoading={isLoading}
        isError={isError}
        dataUpdatedAt={dataUpdatedAt}
        onSelect={handleSearchSelect}
        onSelectStop={handleSearchStopSelect}
      />

      {/* Map — fills the whole area; the nav island and status pill float over it */}
      <div className="relative min-h-0 flex-1">
        {isError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-fg-subtle">
              <p className="text-lg font-medium text-fg">Backend unreachable</p>
              <p className="text-sm mt-1">Make sure the API server is running.</p>
            </div>
          </div>
        ) : (
          <VehicleMap
            vehicles={vehicles}
            onVehicleClick={handleVehicleClick}
            selectedVehicle={selected}
            flyTo={searchFlyTo ?? flyTo}
            selectedStop={selectedStop}
            onStopClick={handleMapStopClick}
          />
        )}

        {/* Vehicle dialog — hidden while a stop dialog is open */}
        {selected && !selectedStop && (
          <VehicleDialog
            vehicle={selected}
            onClose={() => setSelected(null)}
            isStuck={alertsData?.alerts.some(
              (a: StuckAlert) => a.vehicle_id === selected.vehicle_id || (a.vehicle_label && a.vehicle_label === selected.vehicle_label)
            ) ?? false}
          />
        )}
        {/* Stop dialog — closing it returns to vehicle dialog if one was open */}
        {selectedStop && (
          <StopDialog
            stop={selectedStop}
            vehicles={vehicles}
            onClose={() => setSelectedStopId(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingSpinner label="Loading map…" />}>
      <HomePageInner />
    </Suspense>
  );
}

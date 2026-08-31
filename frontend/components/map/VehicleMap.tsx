"use client";

import L from "leaflet";
import { memo, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, Polyline, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import type { VehiclePosition, RailShape, StopInfo } from "@/lib/types";
import { useRailShapes, useRouteShape, useRouteStops } from "@/lib/hooks";
import { useTheme } from "@/lib/useTheme";
import { headwayColor, formatStatusLabel } from "@/lib/utils";
import { createVehicleIcon, iconPx } from "./vehicleIcon";

const DENVER_CENTER: [number, number] = [39.7392, -104.9903];
const DEFAULT_ZOOM = 11;
const DENVER_METRO_BOUNDS: L.LatLngBoundsExpression = [
  [38.2, -106.5],
  [41.2, -103.5],
];

const DOWNTOWN_CENTER: [number, number] = [39.74948688769244, -104.99440656899203];
const DOWNTOWN_ZOOM_THRESHOLD = 14;
const STOP_MARKER_MIN_ZOOM = 13;
// ~1 mile radius (0.0145° ≈ 1609m in latitude); covers Union Station and the
// broader downtown core where stopped vehicles create a dense, unreadable cluster.
const DOWNTOWN_RADIUS_SQ = 0.0145 * 0.0145;

// RTD route_type values that are rail
const RAIL_TYPES = new Set(["0", "1", "2"]); // 0=tram/LRT, 1=subway, 2=commuter rail

interface FlyToCoords {
  lat: number;
  lng: number;
  zoom?: number;
}

interface Props {
  vehicles: VehiclePosition[];
  onVehicleClick: (v: VehiclePosition) => void;
  selectedVehicle?: VehiclePosition | null;
  flyTo?: FlyToCoords | null;
  selectedStop?: StopInfo | null;
  onStopClick?: (stopId: string) => void;
}


/** Official RTD brand colors keyed by route short name (upper-case). */
const RTD_LINE_COLORS: Record<string, string> = {
  A:  "#54C0E8",
  B:  "#4C9C2E",
  C:  "#f79239",
  D:  "#047835",
  E:  "#691F74",
  FF: "#003595",
  G:  "#F4B223",
  H:  "#0055B8",
  L:  "#FFCD00",
  N:  "#904199",
  R:  "#C1D32F",
  T:  "#b71318",
  W:  "#0091B3",
};

/** Draws all RTD rail route shapes as coloured polylines. */
function RailLines() {
  const { data } = useRailShapes();
  if (!data?.shapes) return null;
  return (
    <>
      {data.shapes.flatMap((route: RailShape) => {
        const color =
          RTD_LINE_COLORS[route.short_name.toUpperCase()] ?? route.color;
        return route.shapes.map((coords, i) => (
          <Polyline
            key={`${route.route_id}-${i}`}
            positions={coords as [number, number][]}
            pathOptions={{ color, weight: 4, opacity: 0.9 }}
          />
        ));
      })}
    </>
  );
}

const VehicleMarkers = memo(function VehicleMarkers({ vehicles, onVehicleClick, selectedVehicle }: Props) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  useMapEvents({
    zoomend(e) {
      setZoom((e.target as L.Map).getZoom());
    },
  });

  // Stable primitive key for the selected vehicle so the memo only re-runs
  // when selection actually changes, not on every object reference change.
  const selectedKey = selectedVehicle
    ? (selectedVehicle.vehicle_id ?? selectedVehicle.trip_id ?? null)
    : null;

  // Recompute only when the vehicle set, zoom, or selection changes.
  // Icons themselves come from the module-level cache.
  const markers = useMemo(
    () =>
      vehicles
        .filter((v) => {
          if (v.latitude === null || v.longitude === null) return false;
          if (zoom < DOWNTOWN_ZOOM_THRESHOLD) {
            const dLat = v.latitude - DOWNTOWN_CENTER[0];
            const dLon = v.longitude - DOWNTOWN_CENTER[1];
            if (dLat * dLat + dLon * dLon < DOWNTOWN_RADIUS_SQ) return false;
          }
          return true;
        })
        .map((v, i) => {
          const vKey = v.vehicle_id ?? v.trip_id ?? null;
          const isSelected = vKey !== null && vKey === selectedKey;
          return (
            <Marker
              key={`${v.vehicle_id ?? v.trip_id ?? i}`}
              position={[v.latitude!, v.longitude!]}
              icon={createVehicleIcon(
                v.bearing,
                v.route_color,
                headwayColor(v.headway_minutes),
                isSelected ? "#FFFFFF" : "#000000",
                zoom,
                RAIL_TYPES.has(v.route_type),
              )}
              eventHandlers={{ click: () => onVehicleClick(v) }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                <span className="font-semibold">{v.route_short_name}</span>
                {v.vehicle_label ? ` · #${v.vehicle_label}` : ""}
                {v.stop_name ? (
                  <><br />{formatStatusLabel(v.current_status_label)} {v.stop_name}</>
                ) : null}
              </Tooltip>
            </Marker>
          );
        }),
    [vehicles, zoom, onVehicleClick, selectedKey],
  );

  return <>{markers}</>;
});

function SelectedBusRouteLine({ selectedVehicle }: { selectedVehicle?: VehiclePosition | null }) {
  const selectedIsBus = selectedVehicle?.route_type === "3";
  const routeId = selectedIsBus ? selectedVehicle?.route_id : undefined;
  const { data } = useRouteShape(routeId);

  const busLat = selectedVehicle?.latitude ?? null;
  const busLon = selectedVehicle?.longitude ?? null;

  // Pick the shape variant closest to the bus. Memoized so this O(points) scan
  // runs only when the route/position/shape data changes — not every poll.
  const selectedShape = useMemo(() => {
    const shapes = data?.shapes;
    if (!shapes?.length) return null;
    if (busLat === null || busLon === null) return shapes[0];
    return shapes.reduce((bestShape, currentShape) => {
      const nearest = (shape: number[][]) =>
        shape.reduce((acc, [lat, lon]) => {
          const dLat = lat - busLat;
          const dLon = lon - busLon;
          const d = dLat * dLat + dLon * dLon;
          return d < acc ? d : acc;
        }, Number.POSITIVE_INFINITY);
      return nearest(currentShape) < nearest(bestShape) ? currentShape : bestShape;
    }, shapes[0]);
  }, [data, busLat, busLon]);

  if (!selectedIsBus || !selectedShape) return null;

  return (
    <>
      <Polyline
        positions={selectedShape as [number, number][]}
        pathOptions={{ color: "#7dd3fc", weight: 6, opacity: 0.45 }}
      />
      <Polyline
        positions={selectedShape as [number, number][]}
        pathOptions={{ color: data?.color || "#38bdf8", weight: 3, opacity: 0.95 }}
      />
    </>
  );
}

function RouteStopMarkers({
  selectedVehicle,
  onStopClick,
  selectedStopId,
}: {
  selectedVehicle?: VehiclePosition | null;
  onStopClick?: (stopId: string) => void;
  selectedStopId?: string | null;
}) {
  const { data } = useRouteStops(selectedVehicle?.route_id);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  useMapEvents({ zoomend: (e) => setZoom((e.target as L.Map).getZoom()) });

  if (!data?.stops || !selectedVehicle || zoom < STOP_MARKER_MIN_ZOOM) return null;

  const color = `#${selectedVehicle.route_color || "888888"}`;
  return (
    <>
      {data.stops.map((stop) => {
        const isSelected = stop.stop_id === selectedStopId;
        return (
          <CircleMarker
            key={stop.stop_id}
            center={[stop.stop_lat, stop.stop_lon]}
            radius={isSelected ? 6 : 4}
            pathOptions={{
              color: isSelected ? "#ffffff" : "#ffffff",
              weight: isSelected ? 2 : 1.5,
              fillColor: isSelected ? "#002F87" : color,
              fillOpacity: 0.9,
              opacity: 1,
            }}
            eventHandlers={onStopClick ? { click: () => onStopClick(stop.stop_id) } : {}}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <span className="text-xs">{stop.stop_name}</span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

function SelectedStopMarker({ stop }: { stop: StopInfo }) {
  return (
    <CircleMarker
      center={[stop.stop_lat, stop.stop_lon]}
      radius={10}
      pathOptions={{
        color: "#ffffff",
        weight: 3,
        fillColor: "#002F87",
        fillOpacity: 1,
        opacity: 1,
      }}
    >
      <Tooltip direction="top" offset={[0, -13]} opacity={1}>
        <span className="font-semibold">{stop.stop_name}</span>
        {stop.stop_desc && <><br /><span className="text-xs opacity-75">{stop.stop_desc}</span></>}
      </Tooltip>
    </CircleMarker>
  );
}

function FlyToHandler({ flyTo }: { flyTo?: FlyToCoords | null }) {
  const map = useMap();
  useEffect(() => {
    if (flyTo) {
      map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom ?? 16, { duration: 1.2 });
    }
  }, [map, flyTo]);
  return null;
}

export default function VehicleMap({ vehicles, onVehicleClick, selectedVehicle, flyTo, selectedStop, onStopClick }: Props) {
  const [cartoApiKey, setCartoApiKey] = useState<string | null>(null);
  const { theme } = useTheme();
  const basemap = theme === "light" ? "light_all" : "dark_all";

  useEffect(() => {
    // @ts-expect-error – _getIconUrl is internal
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setCartoApiKey(data.cartoApiKey ?? null))
      .catch(() => {});
  }, []);

  return (
    <MapContainer
      center={DENVER_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={9}
      maxBounds={DENVER_METRO_BOUNDS}
      maxBoundsViscosity={1.0}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        key={basemap}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={`https://{s}.basemaps.cartocdn.com/${basemap}/{z}/{x}/{y}.png${cartoApiKey ? `?key=${cartoApiKey}` : ""}`}
        subdomains="abcd"
        maxZoom={19}
      />
      <FlyToHandler flyTo={flyTo} />
      <RailLines />
      <SelectedBusRouteLine selectedVehicle={selectedVehicle} />
      <RouteStopMarkers
        selectedVehicle={selectedVehicle}
        onStopClick={onStopClick}
        selectedStopId={selectedStop?.stop_id}
      />
      {selectedStop && <SelectedStopMarker stop={selectedStop} />}
      <VehicleMarkers vehicles={vehicles} onVehicleClick={onVehicleClick} selectedVehicle={selectedVehicle} />
    </MapContainer>
  );
}


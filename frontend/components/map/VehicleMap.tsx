"use client";

import L from "leaflet";
import { memo, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, Polyline, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import type { VehiclePosition, RailShape } from "@/lib/types";
import { useRailShapes, useRouteShape, useRouteStops } from "@/lib/hooks";
import { headwayColor } from "@/lib/utils";

const DENVER_CENTER: [number, number] = [39.7392, -104.9903];
const DEFAULT_ZOOM = 11;
const DENVER_METRO_BOUNDS: L.LatLngBoundsExpression = [
  [38.2, -106.5],
  [41.2, -103.5],
];

const DOWNTOWN_CENTER: [number, number] = [39.74948688769244, -104.99440656899203];
const DOWNTOWN_ZOOM_THRESHOLD = 14;
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
}

function iconPx(zoom: number): number {
  if (zoom <= 9)  return 10;
  if (zoom <= 11) return 16;
  if (zoom <= 13) return 22;
  return 28;
}

// Reusable divIcons keyed by their visual inputs. Icons are immutable, so the
// ~200+ vehicles redrawn every poll/zoom collapse into a handful of cache hits
// instead of that many fresh SVG strings + L.divIcon() allocations.
const _iconCache = new Map<string, L.DivIcon>();

/**
 * Bus icon: circle body with a small seamless directional tip, single unified path.
 * Rail icon: rounded rectangle with a pointed nose, single seamless path.
 * Both are rotated by `bearing` and scale with zoom.
 */
function createVehicleIcon(
  bearing: number | null,
  fillColor: string,
  strokeColor: string,
  zoom: number,
  isRail: boolean,
): L.DivIcon {
  // Bucket bearing to 5° so the cache stays small (visually indistinguishable).
  const rot = Math.round((bearing ?? 0) / 5) * 5;
  const cacheKey = `${isRail ? 1 : 0}|${fillColor || "888888"}|${strokeColor}|${zoom}|${rot}`;
  const cached = _iconCache.get(cacheKey);
  if (cached) return cached;

  const s   = iconPx(zoom);
  const cx  = s / 2;
  const sw  = Math.max(1.5, s / 14);
  const fill  = `#${fillColor || "888888"}`;
  let svgBody: string;
  let totalH: number;
  let anchorY: number;

  if (isRail) {
    // Train: elongated body with a pointed nose, drawn as a single unified path
    // so there's no seam between the nose triangle and the body rectangle.
    const w  = Math.round(s * 0.52);
    const bH = Math.round(s * 1.15); // body height
    const nH = Math.round(s * 0.28); // nose height
    const rx = Math.round(w * 0.32);
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    totalH  = nH + bH + Math.ceil(sw * 2);
    anchorY = Math.round(nH + bH / 2);
    const path = [
      `M ${cx} ${sw}`,
      `L ${x1} ${nH}`,
      `L ${x1} ${nH + bH - rx}`,
      `Q ${x1} ${nH + bH} ${x1 - rx} ${nH + bH}`,
      `L ${x0 + rx} ${nH + bH}`,
      `Q ${x0} ${nH + bH} ${x0} ${nH + bH - rx}`,
      `L ${x0} ${nH}`,
      `Z`,
    ].join(" ");
    svgBody = `<svg width="${s}" height="${totalH}" viewBox="0 0 ${s} ${totalH}" xmlns="http://www.w3.org/2000/svg">
      <path d="${path}" fill="${fill}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round"/>
    </svg>`;
  } else {
    // Bus: circle with a small directional tip, single unified path, no seam.
    // The two tip sides are tangent to the circle, flowing into the arc without
    // a visible corner.
    const r    = Math.round(s * 0.39);
    const tip  = Math.round(s * 0.26);            // tip protrusion beyond circle edge
    const h    = r + tip;                          // tip-to-circle-center distance
    const ty   = Math.round(r * r / h);           // tangent point: pixels above center
    const tx   = Math.round(r * Math.sqrt(h * h - r * r) / h); // tangent point: horiz offset
    const cy_c = sw + h;                           // circle center y
    const tanY = cy_c - ty;                        // y of both tangent points
    totalH  = Math.ceil(cy_c + r + sw);
    anchorY = Math.round(cy_c);
    const path = [
      `M ${cx} ${sw}`,                                      // tip
      `L ${cx + tx} ${tanY}`,                               // right tangent point
      `A ${r} ${r} 0 1 1 ${cx - tx} ${tanY}`,              // arc through bottom (cw, large)
      `Z`,
    ].join(" ");
    svgBody = `<svg width="${s}" height="${totalH}" viewBox="0 0 ${s} ${totalH}" xmlns="http://www.w3.org/2000/svg">
      <path d="${path}" fill="${fill}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  const html = `<div style="transform:rotate(${rot}deg);transform-origin:${cx}px ${anchorY}px;width:${s}px;height:${totalH}px;">${svgBody}</div>`;

  const icon = L.divIcon({
    html,
    className: "",
    iconSize:      [s, totalH],
    iconAnchor:    [cx, anchorY],
    tooltipAnchor: [0, -(anchorY + 4)],
  });
  _iconCache.set(cacheKey, icon);
  return icon;
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
                isSelected ? "#FFFFFF" : headwayColor(v.headway_minutes),
                zoom,
                RAIL_TYPES.has(v.route_type),
              )}
              eventHandlers={{ click: () => onVehicleClick(v) }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                <span className="font-semibold">{v.route_short_name}</span>
                {v.vehicle_label ? ` · #${v.vehicle_label}` : ""}
                {v.stop_name ? (
                  <><br />{v.current_status_label ?? ""} {v.stop_name}</>
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

function RouteStopMarkers({ selectedVehicle }: { selectedVehicle?: VehiclePosition | null }) {
  const { data } = useRouteStops(selectedVehicle?.route_id);

  if (!data?.stops || !selectedVehicle) return null;

  const color = `#${selectedVehicle.route_color || "888888"}`;
  return (
    <>
      {data.stops.map((stop) => (
        <CircleMarker
          key={stop.stop_id}
          center={[stop.stop_lat, stop.stop_lon]}
          radius={4}
          pathOptions={{
            color: "#ffffff",
            weight: 1.5,
            fillColor: color,
            fillOpacity: 0.9,
            opacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={1}>
            <span className="text-xs">{stop.stop_name}</span>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
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

export default function VehicleMap({ vehicles, onVehicleClick, selectedVehicle, flyTo }: Props) {
  useEffect(() => {
    // @ts-expect-error – _getIconUrl is internal
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
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
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
        subdomains="abcd"
        maxZoom={19}
      />
      <FlyToHandler flyTo={flyTo} />
      <RailLines />
      <SelectedBusRouteLine selectedVehicle={selectedVehicle} />
      <RouteStopMarkers selectedVehicle={selectedVehicle} />
      <VehicleMarkers vehicles={vehicles} onVehicleClick={onVehicleClick} selectedVehicle={selectedVehicle} />
    </MapContainer>
  );
}


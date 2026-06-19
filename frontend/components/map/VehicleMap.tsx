"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, Polyline, useMapEvents } from "react-leaflet";
import type { VehiclePosition, RailShape } from "@/lib/types";
import { useRailShapes, useRouteShape } from "@/lib/hooks";
import { headwayColor } from "@/lib/utils";

const DENVER_CENTER: [number, number] = [39.7392, -104.9903];
const DEFAULT_ZOOM = 11;

// RTD route_type values that are rail
const RAIL_TYPES = new Set(["0", "1", "2"]); // 0=tram/LRT, 1=subway, 2=commuter rail

interface Props {
  vehicles: VehiclePosition[];
  onVehicleClick: (v: VehiclePosition) => void;
  selectedVehicle?: VehiclePosition | null;
}

function iconPx(zoom: number): number {
  if (zoom <= 9)  return 10;
  if (zoom <= 11) return 16;
  if (zoom <= 13) return 22;
  return 28;
}

/**
 * Bus icon: ice-cream cone (circle body + directional triangle tip).
 * Rail icon: rounded rectangle with a chevron nose — looks like a train front.
 * Both are rotated by `bearing` and scale with zoom.
 */
function createVehicleIcon(
  bearing: number | null,
  fillColor: string,
  strokeColor: string,
  zoom: number,
  isRail: boolean,
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L = require("leaflet") as typeof import("leaflet");

  const s   = iconPx(zoom);
  const cx  = s / 2;
  const sw  = Math.max(1.5, s / 14);
  const fill  = `#${fillColor || "888888"}`;
  const rot   = bearing ?? 0;
  let svgBody: string;
  let totalH: number;
  let anchorY: number;

  if (isRail) {
    // Train: tall rounded rect with a pointed front (top)
    const w   = Math.round(s * 0.55);
    const h   = Math.round(s * 1.4);
    const rx  = Math.round(w * 0.3);
    const x0  = cx - w / 2;
    // Chevron nose: two diagonal lines at the top centre
    const noseH = Math.round(h * 0.22);
    totalH  = h + Math.ceil(sw);
    anchorY = Math.round(h / 2);
    svgBody = `<svg width="${s}" height="${totalH}" viewBox="0 0 ${s} ${totalH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${x0}" y="${noseH}" width="${w}" height="${h - noseH}" rx="${rx}" ry="${rx}"
        fill="${fill}" stroke="${strokeColor}" stroke-width="${sw}"/>
      <polygon points="${cx},${sw} ${x0},${noseH + sw} ${x0 + w},${noseH + sw}"
        fill="${fill}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round"/>
    </svg>`;
  } else {
    // Bus: cone tip + circle
    const r   = Math.round(s * 0.38);
    const cy  = Math.round(s * 0.65);
    const coneBase = cy - r + 2;
    totalH  = cy + r + Math.ceil(sw);
    anchorY = cy;
    svgBody = `<svg width="${s}" height="${totalH}" viewBox="0 0 ${s} ${totalH}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${cx},${sw} ${cx - s * 0.3},${coneBase} ${cx + s * 0.3},${coneBase}"
        fill="${fill}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round"/>
      <circle cx="${cx}" cy="${cy}" r="${r}"
        fill="${fill}" stroke="${strokeColor}" stroke-width="${sw}"/>
    </svg>`;
  }

  const html = `<div style="transform:rotate(${rot}deg);transform-origin:${cx}px ${anchorY}px;width:${s}px;height:${totalH}px;">${svgBody}</div>`;

  return L.divIcon({
    html,
    className: "",
    iconSize:      [s, totalH],
    iconAnchor:    [cx, anchorY],
    tooltipAnchor: [0, -(anchorY + 4)],
  });
}

/** Official RTD brand colors keyed by route short name (upper-case). */
const RTD_LINE_COLORS: Record<string, string> = {
  A:  "#54C0E8",
  B:  "#4C9C2E",
  D:  "#047835",
  E:  "#691F74",
  FF: "#003595",
  G:  "#F4B223",
  H:  "#0055B8",
  L:  "#FFCD00",
  N:  "#904199",
  R:  "#C1D32F",
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

function VehicleMarkers({ vehicles, onVehicleClick }: Props) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  useMapEvents({
    zoomend(e) {
      setZoom((e.target as L.Map).getZoom());
    },
  });

  return (
    <>
      {vehicles
        .filter((v) => v.latitude !== null && v.longitude !== null)
        .map((v, i) => (
          <Marker
            key={`${v.vehicle_id ?? v.trip_id ?? i}`}
            position={[v.latitude!, v.longitude!]}
            icon={createVehicleIcon(
              v.bearing,
              v.route_color,
              headwayColor(v.headway_minutes),
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
        ))}
    </>
  );
}

function SelectedBusRouteLine({ selectedVehicle }: { selectedVehicle?: VehiclePosition | null }) {
  const selectedIsBus = selectedVehicle?.route_type === "3";
  const routeId = selectedIsBus ? selectedVehicle?.route_id : undefined;
  const { data } = useRouteShape(routeId);

  if (!selectedIsBus || !data?.shapes?.length) return null;

  const busLat = selectedVehicle.latitude;
  const busLon = selectedVehicle.longitude;

  const selectedShape =
    busLat === null || busLon === null
      ? data.shapes[0]
      : data.shapes.reduce((bestShape, currentShape) => {
          const bestDistance = bestShape.reduce((acc, [lat, lon]) => {
            const dLat = lat - busLat;
            const dLon = lon - busLon;
            const d = dLat * dLat + dLon * dLon;
            return d < acc ? d : acc;
          }, Number.POSITIVE_INFINITY);

          const currentDistance = currentShape.reduce((acc, [lat, lon]) => {
            const dLat = lat - busLat;
            const dLon = lon - busLon;
            const d = dLat * dLat + dLon * dLon;
            return d < acc ? d : acc;
          }, Number.POSITIVE_INFINITY);

          return currentDistance < bestDistance ? currentShape : bestShape;
        }, data.shapes[0]);

  return (
    <>
      <Polyline
        positions={selectedShape as [number, number][]}
        pathOptions={{ color: "#7dd3fc", weight: 6, opacity: 0.45 }}
      />
      <Polyline
        positions={selectedShape as [number, number][]}
        pathOptions={{ color: data.color || "#38bdf8", weight: 3, opacity: 0.95 }}
      />
    </>
  );
}

export default function VehicleMap({ vehicles, onVehicleClick, selectedVehicle }: Props) {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const L = require("leaflet") as typeof import("leaflet");
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
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
        subdomains="abcd"
        maxZoom={19}
      />
      <RailLines />
      <SelectedBusRouteLine selectedVehicle={selectedVehicle} />
      <VehicleMarkers vehicles={vehicles} onVehicleClick={onVehicleClick} />
    </MapContainer>
  );
}


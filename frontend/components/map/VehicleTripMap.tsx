"use client";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, useMap } from "react-leaflet";
import type { VehicleStopEvent, VehiclePositionTrack } from "@/lib/types";
import { interpolateTrackPosition, formatTime } from "@/lib/utils";
import { createVehicleIcon } from "./vehicleIcon";

const DENVER_CENTER: [number, number] = [39.7392, -104.9903];

function stopDelayColor(seconds: number): string {
  if (seconds > 300) return "#dc2626";  // red — late
  if (seconds < -300) return "#2563eb"; // blue — early
  return "#16a34a";                     // green — on time
}

function BoundsAdjuster({
  positions,
  stops,
}: {
  positions: VehiclePositionTrack[];
  stops: VehicleStopEvent[];
}) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    for (const p of positions) {
      if (p.latitude && p.longitude) pts.push([p.latitude, p.longitude]);
    }
    for (const s of stops) {
      if (s.stop_lat && s.stop_lon) pts.push([s.stop_lat, s.stop_lon]);
    }
    if (pts.length > 0) {
      map.fitBounds(pts, { padding: [24, 24] });
    }
  }, [map, positions, stops]);
  return null;
}

interface Props {
  positions: VehiclePositionTrack[];
  stops: VehicleStopEvent[];
  routeColor: string;
  isRail?: boolean;
  /** Stop whose scheduled-time vehicle position should be highlighted (hovered in the table). */
  highlightStop?: VehicleStopEvent | null;
}

export default function VehicleTripMap({ positions, stops, routeColor, isRail = false, highlightStop }: Props) {
  const [mapClickStop, setMapClickStop] = useState<VehicleStopEvent | null>(null);

  // Table-row hover wins; otherwise fall back to a clicked stop circle on the map.
  const activeStop = highlightStop ?? mapClickStop;

  // Where was the vehicle at this stop's *scheduled* arrival time? Interpolated
  // from the position track — a late vehicle lands behind the stop on the route.
  const highlight = useMemo(() => {
    if (!activeStop) return null;
    const pos = interpolateTrackPosition(positions, activeStop.scheduled_time);
    if (!pos) return null;
    return { ...pos, routeColor, isRail };
  }, [activeStop, positions, routeColor, isRail]);

  useEffect(() => {
    // @ts-expect-error – internal Leaflet default icon URL resolution
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const trackPoints: [number, number][] = positions
    .filter((p) => p.latitude && p.longitude)
    .map((p) => [p.latitude, p.longitude]);

  const center: [number, number] =
    trackPoints.length > 0 ? trackPoints[Math.floor(trackPoints.length / 2)] : DENVER_CENTER;

  const fillColor = routeColor ? `#${routeColor.replace(/^#/, "")}` : "#3b82f6";

  return (
    <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
        subdomains="abcd"
        maxZoom={19}
      />
      <BoundsAdjuster positions={positions} stops={stops} />

      {/* Position track */}
      {trackPoints.length > 1 && (
        <Polyline
          positions={trackPoints}
          pathOptions={{ color: fillColor, weight: 3, opacity: 0.75 }}
        />
      )}

      {/* Stop markers, colored by delay */}
      {stops.map((stop) =>
        stop.stop_lat && stop.stop_lon ? (
          <CircleMarker
            key={`${stop.stop_id}-${stop.stop_sequence}`}
            center={[stop.stop_lat, stop.stop_lon]}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              weight: 1.5,
              fillColor: stopDelayColor(stop.delay_seconds),
              fillOpacity: 0.9,
            }}
            eventHandlers={{
              click: () =>
                setMapClickStop((prev) =>
                  prev &&
                  prev.stop_id === stop.stop_id &&
                  prev.stop_sequence === stop.stop_sequence
                    ? null
                    : stop,
                ),
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              <span className="font-semibold">{stop.stop_name ?? stop.stop_id}</span>
              <br />
              <span>
                {stop.delay_seconds > 0 ? "+" : ""}
                {(stop.delay_seconds / 60).toFixed(1)}m
              </span>
            </Tooltip>
          </CircleMarker>
        ) : null,
      )}

      {/* Hover marker: where the vehicle was at the hovered stop's scheduled arrival time */}
      {highlight && (
        <Marker
          position={[highlight.lat, highlight.lon]}
          icon={createVehicleIcon(
            highlight.bearing,
            highlight.routeColor.replace(/^#/, ""),
            "#ffffff",
            "#000000",
            14,
            highlight.isRail,
          )}
        >
          <Tooltip direction="top" offset={[0, -4]} opacity={1} permanent>
            <span className="font-semibold">Scheduled {activeStop ? formatTime(activeStop.scheduled_time) : ""}</span>
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}

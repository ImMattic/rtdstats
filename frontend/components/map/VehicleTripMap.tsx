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
  /** Current playback time (epoch ms). When set, animates the bus along the track. */
  playbackMs?: number | null;
}

export default function VehicleTripMap({ positions, stops, routeColor, isRail = false, highlightStop, playbackMs }: Props) {
  const [mapClickStop, setMapClickStop] = useState<VehicleStopEvent | null>(null);

  const isPlayback = playbackMs != null;

  // Where is the bus right now in playback? Interpolated from the position track.
  const playbackPos = useMemo(() => {
    if (playbackMs == null) return null;
    return interpolateTrackPosition(positions, new Date(playbackMs).toISOString());
  }, [playbackMs, positions]);

  // Table-row hover wins; otherwise fall back to a clicked stop circle on the map.
  // Suppressed while playback is active so there is only ever one bus on the map.
  const activeStop = isPlayback ? null : (highlightStop ?? mapClickStop);

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

  const trackSamples = positions.filter((p) => p.latitude && p.longitude);
  const trackPoints: [number, number][] = trackSamples.map((p) => [p.latitude, p.longitude]);

  // During playback, split the track into the portion already travelled (bright)
  // and the portion still ahead (dim) so the route "fills in" behind the bus.
  const traveledCount =
    playbackMs == null
      ? trackPoints.length
      : trackSamples.filter((p) => new Date(p.timestamp).getTime() <= playbackMs).length;
  const traveledPoints = trackPoints.slice(0, Math.max(traveledCount, 0));
  const upcomingPoints =
    playbackMs == null ? [] : trackPoints.slice(Math.max(traveledCount - 1, 0));

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

      {/* Position track: dim "upcoming" leg underneath, bright "traveled" leg on top */}
      {upcomingPoints.length > 1 && (
        <Polyline
          positions={upcomingPoints}
          pathOptions={{ color: fillColor, weight: 3, opacity: 0.25 }}
        />
      )}
      {traveledPoints.length > 1 && (
        <Polyline
          positions={traveledPoints}
          pathOptions={{ color: fillColor, weight: 3, opacity: 0.85 }}
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

      {/* Playback marker: the bus at the current playback time */}
      {playbackPos && (
        <Marker
          position={[playbackPos.lat, playbackPos.lon]}
          icon={createVehicleIcon(
            playbackPos.bearing,
            fillColor.replace(/^#/, ""),
            "#ffffff",
            "#000000",
            14,
            isRail,
          )}
          zIndexOffset={1000}
        >
          <Tooltip direction="top" offset={[0, -4]} opacity={1} permanent>
            <span className="font-semibold">{playbackMs != null ? formatTime(new Date(playbackMs).toISOString()) : ""}</span>
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}

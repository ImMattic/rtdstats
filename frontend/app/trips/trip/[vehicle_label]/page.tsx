"use client";
import dynamic from "next/dynamic";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useVehicleTrip } from "@/lib/hooks";
import { usePlayback } from "@/lib/usePlayback";
import { Card, SectionHeading } from "@/components/ui/Card";
import TransitLoader from "@/components/ui/TransitLoader";
import TripPlaybackControls from "@/components/map/TripPlaybackControls";
import { formatDelay, formatDelayMin, routeColor } from "@/lib/utils";
import type { VehicleStopEvent } from "@/lib/types";

const VehicleTripMap = dynamic(() => import("@/components/map/VehicleTripMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full" />,
});

const OCCUPANCY_LABELS: Record<string, string> = {
  EMPTY: "Empty",
  MANY_SEATS_AVAILABLE: "Many seats",
  FEW_SEATS_AVAILABLE: "Few seats",
  STANDING_ROOM_ONLY: "Standing room",
  CRUSHED_STANDING_ROOM_ONLY: "Crushed",
  FULL: "Full",
  NOT_ACCEPTING_PASSENGERS: "Not accepting",
  UNKNOWN: "—",
};

function delayClass(seconds: number): string {
  if (seconds > 300) return "text-danger font-semibold";
  if (seconds < -300) return "text-accent font-semibold";
  return "text-ok";
}

function delayBadge(seconds: number): string {
  if (seconds > 600) return "status-danger";
  if (seconds > 300) return "status-warn";
  if (seconds < -300) return "status-info";
  return "status-ok";
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-card">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-fg">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}

const RAIL_TYPES = new Set(["0", "1", "2"]);

function TripDetailContent({ vehicleLabel }: { vehicleLabel: string }) {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("trip_id") ?? undefined;
  const [hoveredStop, setHoveredStop] = useState<VehicleStopEvent | null>(null);
  // start/end bound the full extent of this single trip leg (set by the list).
  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;

  const { data, isLoading, isError } = useVehicleTrip(vehicleLabel, {
    trip_id: tripId,
    start,
    end,
  });

  // The breadcrumb returns to the originating list window, not this leg's bounds.
  const retStart = searchParams.get("ret_start");
  const retEnd = searchParams.get("ret_end");
  const retRouteId = searchParams.get("ret_route_id");
  const backQs = new URLSearchParams();
  if (retStart) backQs.set("start", retStart);
  if (retEnd) backQs.set("end", retEnd);
  if (retRouteId) backQs.set("route_id", retRouteId);
  const backHref = `/trips${backQs.toString() ? `?${backQs}` : ""}`;

  const routeHex = routeColor(data?.route_color ?? "888888");

  const lastOccupancy = data?.positions.length
    ? data.positions[data.positions.length - 1].occupancy_status
    : null;

  // Prefer the trip's actual extent (first→last snapshot) over the padded
  // query bounds for the header timestamp.
  const tripStart = data?.positions.length ? data.positions[0].timestamp : start;
  const tripEnd = data?.positions.length
    ? data.positions[data.positions.length - 1].timestamp
    : end;

  // Playback clock for the Trip Track map (epoch ms bounds from the position track).
  const playbackStartMs = data?.positions.length ? Date.parse(data.positions[0].timestamp) : 0;
  const playbackEndMs = data?.positions.length
    ? Date.parse(data.positions[data.positions.length - 1].timestamp)
    : 0;
  const playback = usePlayback(playbackStartMs, playbackEndMs);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 text-fg">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <Link href={backHref} className="hover:text-accent">
          Trips
        </Link>
        <span>/</span>
        <span className="text-fg-muted">#{vehicleLabel}</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-fg">Vehicle #{vehicleLabel}</h1>
          {data?.route_short_name && (
            <span
              className="rounded px-2.5 py-1 text-sm font-bold text-white"
              style={{ backgroundColor: routeHex }}
            >
              Route {data.route_short_name}
            </span>
          )}
        </div>
        {data?.route_long_name && (
          <p className="mt-0.5 text-sm text-fg-muted">{data.route_long_name}</p>
        )}
        {(tripStart || tripEnd) && (
          <p className="mt-0.5 text-xs text-fg-subtle">
            {tripStart
              ? new Date(tripStart).toLocaleString([], {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : ""}
            {tripStart && tripEnd ? " – " : ""}
            {tripEnd
              ? new Date(tripEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : ""}
          </p>
        )}
      </div>

      {isLoading && <TransitLoader label="Loading trip" />}
      {isError && (
        <p className="rounded status-danger px-4 py-3 text-sm">
          Failed to load trip data.
        </p>
      )}

      {!isLoading && !isError && data && (
        <>
          {/* Stat strip */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatBox
              label="Avg Delay"
              value={
                data.avg_delay_seconds !== null ? formatDelayMin(data.avg_delay_seconds) : "—"
              }
              sub={data.stops.length ? `across ${data.stops.length} stops` : "no stop data"}
            />
            <StatBox
              label="On-Time Rate"
              value={data.on_time_pct !== null ? `${data.on_time_pct}%` : "—"}
              sub="±5 min window"
            />
            <StatBox
              label="Occupancy"
              value={OCCUPANCY_LABELS[lastOccupancy ?? "UNKNOWN"] ?? "—"}
              sub="last known"
            />
            <StatBox
              label="Samples"
              value={String(data.observation_count)}
              sub="position snapshots"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Stop timeline */}
            <Card className="lg:col-span-1">
              <SectionHeading title="Stop Arrival Timeline" />
              {data.stops.length === 0 ? (
                <p className="py-6 text-center text-sm text-fg-muted">
                  Stop arrival events are derived from geofencing. Data may not be available for
                  all trips or older time windows.
                </p>
              ) : (
                <div className="overflow-x-auto rounded border border-line">
                  <table className="min-w-full text-sm text-fg">
                    <thead className="bg-card-muted text-xs uppercase text-fg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Stop</th>
                        <th className="px-3 py-2 text-right">Scheduled</th>
                        <th className="px-3 py-2 text-right">Actual</th>
                        <th className="px-3 py-2 text-right">Delay</th>
                        <th className="px-3 py-2 text-left">Occupancy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.stops.map((stop) => (
                        <tr
                          key={`${stop.stop_id}-${stop.stop_sequence}`}
                          className="hover:bg-card-muted cursor-default"
                          onMouseEnter={() => setHoveredStop(stop)}
                          onMouseLeave={() => setHoveredStop(null)}
                        >
                          <td className="px-3 py-2 text-fg-subtle">{stop.stop_sequence}</td>
                          <td className="px-3 py-2 font-medium">
                            {stop.stop_name ?? stop.stop_id}
                          </td>
                          <td className="px-3 py-2 text-right text-fg-muted">
                            {new Date(stop.scheduled_time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {new Date(stop.actual_time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className={`px-3 py-2 text-right ${delayClass(stop.delay_seconds)}`}>
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs ${delayBadge(stop.delay_seconds)}`}
                            >
                              {formatDelay(stop.delay_seconds) || "On time"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-fg-muted">
                            {OCCUPANCY_LABELS[stop.occupancy_status ?? "UNKNOWN"] ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Trip map */}
            <Card className="lg:col-span-1">
              <SectionHeading
                title="Trip Track"
                subtitle="Press play to replay the trip, or hover a stop for its scheduled position"
              />
              {data.positions.length === 0 && data.stops.length === 0 ? (
                <p className="py-6 text-center text-sm text-fg-muted">
                  No position data available.
                </p>
              ) : (
                <>
                  <div className="h-[420px] overflow-hidden rounded border border-line">
                    <VehicleTripMap
                      positions={data.positions}
                      stops={data.stops}
                      routeColor={data.route_color ?? "3b82f6"}
                      isRail={RAIL_TYPES.has(data.route_type ?? "")}
                      highlightStop={hoveredStop}
                      playbackMs={playback.active ? playback.currentMs : null}
                    />
                  </div>
                  {data.positions.length >= 2 && (
                    <TripPlaybackControls
                      playback={playback}
                      startMs={playbackStartMs}
                      endMs={playbackEndMs}
                      routeColor={data.route_color ?? "3b82f6"}
                    />
                  )}
                </>
              )}
            </Card>
          </div>

          {data.trip_id && (
            <p className="text-xs text-fg-subtle">
              Trip ID: <span className="font-mono">{data.trip_id}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function TripDetailPage({
  params,
}: {
  params: { vehicle_label: string };
}) {
  const vehicleLabel = decodeURIComponent(params.vehicle_label);
  return (
    <Suspense fallback={<TransitLoader label="Loading trip" />}>
      <TripDetailContent vehicleLabel={vehicleLabel} />
    </Suspense>
  );
}

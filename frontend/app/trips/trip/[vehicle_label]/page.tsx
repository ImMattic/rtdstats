"use client";
import dynamic from "next/dynamic";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useVehicleTrip } from "@/lib/hooks";
import { usePlayback } from "@/lib/usePlayback";
import { Card, SectionHeading } from "@/components/ui/Card";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import TripPlaybackControls from "@/components/map/TripPlaybackControls";
import { formatDelay, formatDelayMin, routeColor } from "@/lib/utils";
import type { VehicleStopEvent } from "@/lib/types";

const VehicleTripMap = dynamic(() => import("@/components/map/VehicleTripMap"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded bg-raised" />,
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

function delayBadge(seconds: number): string {
  if (seconds > 600) return "status-danger";
  if (seconds > 300) return "status-warn";
  if (seconds < -300) return "status-info";
  return "status-ok";
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-card">
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className="mt-1 text-2xl font-bold text-fg">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}

function hhmm(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Fill colour for a solid (observed) timeline node. */
function nodeFill(seconds: number | null): string {
  if (seconds === null) return "bg-fg-subtle";
  if (seconds > 600) return "bg-danger";
  if (seconds > 300) return "bg-warn";
  if (seconds < -300) return "bg-accent";
  return "bg-ok";
}

/**
 * Full stop-by-stop schedule for the trip's direction: every RTD timepoint and
 * intermediate stop from origin to terminus. Stops the vehicle was geofenced at
 * ("tracked") carry an actual time + delay; the rest show the schedule only.
 */
function StopTimeline({
  stops,
  onHover,
}: {
  stops: VehicleStopEvent[];
  onHover: (s: VehicleStopEvent | null) => void;
}) {
  return (
    <ol className="max-h-[560px] overflow-y-auto pr-1">
      {stops.map((stop, i) => {
        const isFirst = i === 0;
        const isLast = i === stops.length - 1;
        const terminus = isFirst ? "Origin" : isLast ? "Terminus" : null;
        return (
          <li
            key={`${stop.stop_id}-${stop.stop_sequence}`}
            className="group flex gap-3 rounded px-1.5 hover:bg-raised"
            onMouseEnter={() => onHover(stop)}
            onMouseLeave={() => onHover(null)}
          >
            {/* Rail */}
            <div className="flex w-3 shrink-0 flex-col items-center">
              <span className={`w-px ${isFirst ? "h-3" : "h-3 bg-line-strong"}`} />
              <span
                className={
                  stop.observed
                    ? `${stop.is_timepoint ? "h-3.5 w-3.5" : "h-2.5 w-2.5"} rounded-full ${nodeFill(
                        stop.delay_seconds,
                      )} ring-2 ring-card`
                    : `${
                        stop.is_timepoint ? "h-3 w-3 border-fg-subtle" : "h-2.5 w-2.5 border-line-strong"
                      } rounded-full border-2 bg-card`
                }
              />
              <span className={`w-px flex-1 ${isLast ? "" : "bg-line-strong"}`} />
            </div>

            {/* Content */}
            <div className="flex flex-1 items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p
                  className={`truncate text-sm ${
                    stop.is_timepoint ? "font-semibold text-fg" : "font-medium text-fg-muted"
                  }`}
                >
                  {stop.stop_name ?? stop.stop_id}
                </p>
                <p className="mt-0.5 text-[11px] text-fg-subtle">
                  #{stop.stop_sequence}
                  {terminus && (
                    <span className="ml-1.5 rounded bg-raised px-1 py-px font-medium uppercase tracking-wide text-fg-muted">
                      {terminus}
                    </span>
                  )}
                  {stop.observed && stop.occupancy_status && stop.occupancy_status !== "UNKNOWN" && (
                    <span className="ml-1.5">
                      · {OCCUPANCY_LABELS[stop.occupancy_status] ?? stop.occupancy_status}
                    </span>
                  )}
                </p>
              </div>

              <div className="shrink-0 text-right">
                {stop.observed ? (
                  <>
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-sm tabular-nums text-fg">{hhmm(stop.actual_time)}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[11px] ${delayBadge(
                          stop.delay_seconds ?? 0,
                        )}`}
                      >
                        {formatDelay(stop.delay_seconds) || "On time"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-fg-subtle">
                      sched {hhmm(stop.scheduled_time)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm tabular-nums text-fg-muted">
                      {hhmm(stop.scheduled_time)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-fg-subtle">scheduled</div>
                  </>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
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

  const observedStopCount =
    data?.observed_stop_count ?? data?.stops.filter((s) => s.observed).length ?? 0;

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
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-6 pt-24 text-fg">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-fg-subtle">
        <Link href={backHref} className="hover:text-accent">
          Trips
        </Link>
        <span>/</span>
        <span className="text-fg-muted">#{vehicleLabel}</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-fg">Vehicle #{vehicleLabel}</h1>
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
          <p className="mt-0.5 text-sm text-fg-subtle">{data.route_long_name}</p>
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

      {isLoading && <LoadingSpinner />}
      {isError && (
        <p className="status-danger rounded px-4 py-3 text-sm">
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
              sub={
                observedStopCount
                  ? `across ${observedStopCount} tracked stop${observedStopCount === 1 ? "" : "s"}`
                  : "no tracked stops"
              }
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
              <SectionHeading
                title="Stop Timeline"
                subtitle={
                  data.stops.length
                    ? `Every scheduled stop, origin → terminus · ${observedStopCount}/${data.stops.length} tracked`
                    : undefined
                }
              />
              {data.stops.length === 0 ? (
                <p className="py-6 text-center text-sm text-fg-subtle">
                  No schedule found for this trip. The stop timeline is built from RTD&rsquo;s
                  static schedule for the trip&rsquo;s direction — it may be unavailable for
                  added/modified trips or older time windows.
                </p>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-ok" /> tracked (colour = delay)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full border-2 border-line-strong bg-card" />{" "}
                      scheduled only
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full border-2 border-fg-subtle bg-card" />{" "}
                      timepoint
                    </span>
                  </div>
                  <StopTimeline stops={data.stops} onHover={setHoveredStop} />
                </>
              )}
            </Card>

            {/* Trip map */}
            <Card className="lg:col-span-1">
              <SectionHeading
                title="Trip Track"
                subtitle="Press play to replay the trip, or hover a stop for its scheduled position"
              />
              {data.positions.length === 0 && data.stops.length === 0 ? (
                <p className="py-6 text-center text-sm text-fg-subtle">
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
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-24">
          <p className="text-sm text-fg-subtle">Loading…</p>
        </div>
      }
    >
      <TripDetailContent vehicleLabel={vehicleLabel} />
    </Suspense>
  );
}

"use client";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useVehicleTrip } from "@/lib/hooks";
import { Card, SectionHeading } from "@/components/ui/Card";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatDelay, formatDelayMin, routeColor } from "@/lib/utils";

const VehicleTripMap = dynamic(() => import("@/components/map/VehicleTripMap"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded bg-gray-800" />,
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
  if (seconds > 120) return "text-red-600 font-semibold";
  if (seconds < -120) return "text-blue-600 font-semibold";
  return "text-green-600";
}

function delayBadge(seconds: number): string {
  if (seconds > 300) return "bg-red-100 text-red-700";
  if (seconds > 120) return "bg-orange-100 text-orange-700";
  if (seconds < -120) return "bg-blue-100 text-blue-700";
  return "bg-green-100 text-green-700";
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function VehicleDetailContent({ vehicleLabel }: { vehicleLabel: string }) {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("trip_id") ?? undefined;
  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;

  const { data, isLoading, isError } = useVehicleTrip(vehicleLabel, {
    trip_id: tripId,
    start,
    end,
  });

  // Build back-link that preserves the same time window on the vehicle list
  const backQs = new URLSearchParams();
  if (start) backQs.set("start", start);
  if (end) backQs.set("end", end);
  if (data?.route_id) backQs.set("route_id", data.route_id);
  const backHref = `/dashboard/vehicles${backQs.toString() ? `?${backQs}` : ""}`;

  const routeHex = routeColor(data?.route_color ?? "888888");

  // Most-recent occupancy from position track
  const lastOccupancy = data?.positions.length
    ? data.positions[data.positions.length - 1].occupancy_status
    : null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 text-gray-900">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-rtd-blue">
          Dashboard
        </Link>
        <span>/</span>
        <Link href={backHref} className="hover:text-rtd-blue">
          Active Vehicles
        </Link>
        <span>/</span>
        <span className="text-gray-700">#{vehicleLabel}</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Vehicle #{vehicleLabel}</h1>
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
          <p className="mt-0.5 text-sm text-gray-500">{data.route_long_name}</p>
        )}
        {(start || end) && (
          <p className="mt-0.5 text-xs text-gray-400">
            {start ? new Date(start).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : ""}
            {start && end ? " – " : ""}
            {end ? new Date(end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
          </p>
        )}
      </div>

      {isLoading && <LoadingSpinner />}
      {isError && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          Failed to load trip data.
        </p>
      )}

      {!isLoading && !isError && data && (
        <>
          {/* Stat strip */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatBox
              label="Avg Delay"
              value={data.avg_delay_seconds !== null ? formatDelayMin(data.avg_delay_seconds) : "—"}
              sub={data.stops.length ? `across ${data.stops.length} stops` : "no stop data"}
            />
            <StatBox
              label="On-Time Rate"
              value={data.on_time_pct !== null ? `${data.on_time_pct}%` : "—"}
              sub="±2 min window"
            />
            <StatBox
              label="Occupancy"
              value={OCCUPANCY_LABELS[lastOccupancy ?? "UNKNOWN"] ?? "—"}
              sub="last known"
            />
            <StatBox
              label="Observations"
              value={String(data.observation_count)}
              sub="position snapshots"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Stop timeline */}
            <Card className="lg:col-span-1">
              <SectionHeading
                title="Stop Arrival Timeline"
                subtitle={
                  data.stops.length
                    ? `${data.stops.length} stops · green = on time, red = late, blue = early`
                    : "No stop arrival data recorded for this trip"
                }
              />
              {data.stops.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">
                  Stop arrival events are derived from geofencing. Data may not be available for all
                  trips or older time windows.
                </p>
              ) : (
                <div className="overflow-x-auto rounded border border-gray-200">
                  <table className="min-w-full text-sm text-gray-800">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Stop</th>
                        <th className="px-3 py-2 text-right">Scheduled</th>
                        <th className="px-3 py-2 text-right">Actual</th>
                        <th className="px-3 py-2 text-right">Delay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.stops.map((stop) => (
                        <tr key={`${stop.stop_id}-${stop.stop_sequence}`} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400">{stop.stop_sequence}</td>
                          <td className="px-3 py-2 font-medium">{stop.stop_name ?? stop.stop_id}</td>
                          <td className="px-3 py-2 text-right text-gray-500">
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
                subtitle="Position history · stop markers colored by delay"
              />
              {data.positions.length === 0 && data.stops.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">No position data available.</p>
              ) : (
                <div className="h-[420px] overflow-hidden rounded border border-gray-200">
                  <VehicleTripMap
                    positions={data.positions}
                    stops={data.stops}
                    routeColor={data.route_color ?? "3b82f6"}
                  />
                </div>
              )}
            </Card>
          </div>

          {/* Trip ID reference */}
          {data.trip_id && (
            <p className="text-xs text-gray-400">
              Trip ID: <span className="font-mono">{data.trip_id}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function VehicleDetailPage({
  params,
}: {
  params: { vehicle_label: string };
}) {
  const vehicleLabel = decodeURIComponent(params.vehicle_label);
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-7xl px-4 py-6"><p className="text-sm text-gray-500">Loading…</p></div>}>
      <VehicleDetailContent vehicleLabel={vehicleLabel} />
    </Suspense>
  );
}

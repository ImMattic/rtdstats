"use client";
import { Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useActiveVehicles } from "@/lib/hooks";
import { Card, SectionHeading } from "@/components/ui/Card";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatDelay, formatDateTime, routeColor } from "@/lib/utils";
import type { ActiveVehicle } from "@/lib/types";

const OCCUPANCY_SHORT: Record<string, string> = {
  EMPTY: "Empty",
  MANY_SEATS_AVAILABLE: "Many seats",
  FEW_SEATS_AVAILABLE: "Few seats",
  STANDING_ROOM_ONLY: "Standing",
  CRUSHED_STANDING_ROOM_ONLY: "Crushed",
  FULL: "Full",
  NOT_ACCEPTING_PASSENGERS: "Not accepting",
  UNKNOWN: "—",
};

function delayBg(seconds: number | null): string {
  if (seconds === null) return "text-gray-400";
  if (seconds > 120) return "text-red-600 font-semibold";
  if (seconds < -120) return "text-blue-600 font-semibold";
  return "text-green-600 font-semibold";
}

function RouteBadge({ shortName, color }: { shortName: string | null; color: string | null }) {
  const bg = routeColor(color ?? "888888");
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-xs font-bold text-white"
      style={{ backgroundColor: bg }}
    >
      {shortName ?? "?"}
    </span>
  );
}

function VehiclesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;
  const routeId = searchParams.get("route_id") ?? undefined;

  const { data, isLoading, isError } = useActiveVehicles({ start, end, route_id: routeId });

  const timeLabel = useMemo(() => {
    if (!start || !end) return "";
    const s = new Date(start);
    const e = new Date(end);
    const diffMs = e.getTime() - s.getTime();
    const diffH = diffMs / 3_600_000;
    if (diffH <= 1.5) {
      return `${formatDateTime(start)} – ${e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    return `${formatDateTime(start)} – ${formatDateTime(end)}`;
  }, [start, end]);

  function handleVehicleClick(v: ActiveVehicle) {
    if (!v.vehicle_label) return;
    const qs = new URLSearchParams();
    if (v.trip_id) qs.set("trip_id", v.trip_id);
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);
    router.push(`/dashboard/vehicles/${encodeURIComponent(v.vehicle_label)}?${qs}`);
  }

  const backHref = "/dashboard";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 text-gray-900">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href={backHref} className="hover:text-rtd-blue">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-gray-700">Active Vehicles</span>
        {routeId && (
          <>
            <span>/</span>
            <span className="text-gray-700">Route {routeId}</span>
          </>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-white">Active Vehicles</h1>
        <p className="text-sm text-gray-500">
          {timeLabel ? `${timeLabel} · ` : ""}
          {isLoading ? "Loading…" : `${data?.vehicle_count ?? 0} vehicles`}
          {routeId ? ` · Route ${routeId}` : " · all routes"}
        </p>
      </div>

      <Card>
        <SectionHeading
          title="Vehicles"
          subtitle="Click a row to see the vehicle's stop-by-stop timeline"
        />

        {isLoading && <LoadingSpinner />}

        {isError && (
          <p className="py-8 text-center text-sm text-red-500">
            Failed to load vehicles. The time window may be out of range.
          </p>
        )}

        {!isLoading && !isError && data?.vehicles.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">
            No vehicle data found for this time window.
          </p>
        )}

        {!isLoading && !isError && (data?.vehicles.length ?? 0) > 0 && (
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-sm text-gray-800">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Route</th>
                  <th className="px-3 py-2 text-left">Vehicle</th>
                  <th className="px-3 py-2 text-left">Trip ID</th>
                  <th className="px-3 py-2 text-left">First seen</th>
                  <th className="px-3 py-2 text-left">Last seen</th>
                  <th className="px-3 py-2 text-right">Delay</th>
                  <th className="px-3 py-2 text-left">Occupancy</th>
                  <th className="px-3 py-2 text-right">Obs.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data!.vehicles.map((v, i) => (
                  <tr
                    key={`${v.vehicle_label ?? ""}-${v.trip_id ?? i}`}
                    className="cursor-pointer hover:bg-blue-50"
                    onClick={() => handleVehicleClick(v)}
                  >
                    <td className="px-3 py-2">
                      <RouteBadge shortName={v.route_short_name} color={v.route_color} />
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      {v.vehicle_label ? `#${v.vehicle_label}` : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">
                      {v.trip_id ? v.trip_id.slice(0, 12) + (v.trip_id.length > 12 ? "…" : "") : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {new Date(v.first_seen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {new Date(v.last_seen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className={`px-3 py-2 text-right ${delayBg(v.last_delay_seconds)}`}>
                      {v.last_delay_seconds !== null ? formatDelay(v.last_delay_seconds) || "On time" : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {OCCUPANCY_SHORT[v.last_occupancy_status ?? "UNKNOWN"] ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">{v.observation_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function VehiclesPage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-7xl px-4 py-6"><p className="text-sm text-gray-500">Loading…</p></div>}>
      <VehiclesContent />
    </Suspense>
  );
}

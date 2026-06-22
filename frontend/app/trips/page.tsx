"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useActiveVehicles, useRoutes } from "@/lib/hooks";
import { Card, SectionHeading } from "@/components/ui/Card";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ExportButton from "@/components/ui/ExportButton";
import { formatDateTime, routeColor } from "@/lib/utils";
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

function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TripsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRouteId = searchParams.get("route_id");

  const [startLocal, setStartLocal] = useState(() =>
    urlStart
      ? toDatetimeLocal(urlStart)
      : toDatetimeLocal(new Date(Date.now() - 3_600_000).toISOString()),
  );
  const [endLocal, setEndLocal] = useState(() =>
    urlEnd ? toDatetimeLocal(urlEnd) : toDatetimeLocal(new Date().toISOString()),
  );
  const [routeId, setRouteId] = useState(urlRouteId ?? "");
  const [routeSearch, setRouteSearch] = useState("");
  const [routeDropdownOpen, setRouteDropdownOpen] = useState(false);
  const routeComboRef = useRef<HTMLDivElement>(null);

  // Sync picker state when URL params change (e.g. after "Load trips" or browser back/forward)
  useEffect(() => {
    if (urlStart) setStartLocal(toDatetimeLocal(urlStart));
    if (urlEnd) setEndLocal(toDatetimeLocal(urlEnd));
    setRouteId(urlRouteId ?? "");
  }, [urlStart, urlEnd, urlRouteId]);

  const defaultStart = useMemo(() => new Date(Date.now() - 3_600_000).toISOString(), []);
  const defaultEnd = useMemo(() => new Date().toISOString(), []);

  const fetchStart = urlStart ?? defaultStart;
  const fetchEnd = urlEnd ?? defaultEnd;
  const fetchRouteId = urlRouteId ?? undefined;

  const routes = useRoutes();
  const raw = useActiveVehicles({ start: fetchStart, end: fetchEnd, route_id: fetchRouteId });
  const { isLoading, isError } = raw;

  const data = useMemo(() => {
    if (!raw.data) return raw.data;
    const vehicles = raw.data.vehicles.filter(
      (v) => v.observation_count >= 10 && v.stop_arrival_count > 1,
    );
    return { ...raw.data, vehicles, vehicle_count: vehicles.length };
  }, [raw.data]);

  const sortedRoutes = useMemo(() => {
    const list = routes.data?.routes ?? [];
    return [...list].sort((a, b) =>
      a.short_name.localeCompare(b.short_name, undefined, { numeric: true }),
    );
  }, [routes.data]);

  const groupedRoutes = useMemo(() => {
    const q = routeSearch.toLowerCase().trim();
    const filtered = q
      ? sortedRoutes.filter(
          (r) =>
            r.short_name.toLowerCase().includes(q) || r.long_name.toLowerCase().includes(q),
        )
      : sortedRoutes;
    return {
      rail: filtered.filter((r) => r.type_name !== "bus" && r.type_name !== "other"),
      bus: filtered.filter((r) => r.type_name === "bus"),
      other: filtered.filter((r) => r.type_name === "other"),
    };
  }, [sortedRoutes, routeSearch]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (routeComboRef.current && !routeComboRef.current.contains(e.target as Node)) {
        setRouteDropdownOpen(false);
        setRouteSearch("");
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const isValidRange = useMemo(() => {
    try {
      return new Date(startLocal) < new Date(endLocal);
    } catch {
      return false;
    }
  }, [startLocal, endLocal]);

  function handleLoad() {
    const qs = new URLSearchParams({
      start: new Date(startLocal).toISOString(),
      end: new Date(endLocal).toISOString(),
    });
    if (routeId) qs.set("route_id", routeId);
    router.push(`/trips?${qs}`);
  }

  function handleVehicleClick(v: ActiveVehicle) {
    if (!v.vehicle_label) return;
    const qs = new URLSearchParams();
    if (v.trip_id) qs.set("trip_id", v.trip_id);
    // Fetch the *full* leg: pad the trip's own start/end by a couple minutes so
    // the very first/last snapshot is captured, while still bounding to this
    // single occurrence of the trip_id.
    const pad = 2 * 60_000;
    qs.set("start", new Date(new Date(v.start_time).getTime() - pad).toISOString());
    qs.set("end", new Date(new Date(v.end_time).getTime() + pad).toISOString());
    // Preserve the list's window so the breadcrumb returns to the same view.
    qs.set("ret_start", fetchStart);
    qs.set("ret_end", fetchEnd);
    if (fetchRouteId) qs.set("ret_route_id", fetchRouteId);
    router.push(`/trips/trip/${encodeURIComponent(v.vehicle_label)}?${qs}`);
  }

  const timeLabel = useMemo(() => {
    try {
      const s = new Date(fetchStart);
      const e = new Date(fetchEnd);
      const diffH = (e.getTime() - s.getTime()) / 3_600_000;
      if (diffH <= 1.5) {
        return `${formatDateTime(fetchStart)} – ${e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      }
      return `${formatDateTime(fetchStart)} – ${formatDateTime(fetchEnd)}`;
    } catch {
      return "";
    }
  }, [fetchStart, fetchEnd]);

  const fetchSelectedRouteName = routes.data?.routes.find(
    (r) => r.route_id === fetchRouteId,
  )?.short_name;

  const selectedRouteName = routes.data?.routes.find((r) => r.route_id === routeId)?.short_name;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 text-gray-900">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-rtd-blue">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-gray-700">Trips</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Trip Explorer</h1>
          <p className="text-sm text-gray-500">
            {timeLabel ? `${timeLabel} · ` : ""}
            {isLoading ? "Loading…" : `${data?.vehicle_count ?? 0} vehicles`}
            {fetchRouteId
              ? ` · Route ${fetchSelectedRouteName ?? fetchRouteId}`
              : " · all routes"}
          </p>
        </div>
        <ExportButton routeId={fetchRouteId} start={fetchStart} end={fetchEnd} />
      </div>

      {/* Filter bar */}
      <Card>
        <SectionHeading
          title="Filters"
          subtitle="Select a date/time range and optionally filter by route, then click Load"
        />
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Start</label>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rtd-blue"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">End</label>
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              className="rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rtd-blue"
            />
          </div>

          {/* Route combobox */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Route</label>
            <div ref={routeComboRef} className="relative">
              <div className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-rtd-blue">
                <svg
                  className="h-3.5 w-3.5 shrink-0 text-gray-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                    clipRule="evenodd"
                  />
                </svg>
                <input
                  type="text"
                  value={routeDropdownOpen ? routeSearch : ""}
                  placeholder={selectedRouteName ? `Route ${selectedRouteName}` : "All routes"}
                  onChange={(e) => setRouteSearch(e.target.value)}
                  onFocus={() => setRouteDropdownOpen(true)}
                  className="w-44 bg-transparent outline-none placeholder-gray-700"
                />
                {routeId && (
                  <button
                    onClick={() => {
                      setRouteId("");
                      setRouteSearch("");
                      setRouteDropdownOpen(false);
                    }}
                    aria-label="Clear route filter"
                    className="shrink-0 text-gray-400 hover:text-gray-600"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                )}
              </div>
              {routeDropdownOpen && (
                <ul className="absolute left-0 top-full z-50 mt-1 max-h-64 w-64 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
                  <li>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setRouteId("");
                        setRouteSearch("");
                        setRouteDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
                    >
                      All routes
                    </button>
                  </li>
                  {groupedRoutes.rail.length > 0 && (
                    <>
                      <li className="border-t border-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Rail
                      </li>
                      {groupedRoutes.rail.map((r) => (
                        <li key={r.route_id}>
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setRouteId(r.route_id);
                              setRouteSearch("");
                              setRouteDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${r.route_id === routeId ? "bg-blue-50 font-medium text-rtd-blue" : "text-gray-700"}`}
                          >
                            <span className="font-medium">{r.short_name}</span>
                            <span className="ml-1.5 text-gray-400">— {r.long_name}</span>
                          </button>
                        </li>
                      ))}
                    </>
                  )}
                  {groupedRoutes.bus.length > 0 && (
                    <>
                      <li className="border-t border-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Bus
                      </li>
                      {groupedRoutes.bus.map((r) => (
                        <li key={r.route_id}>
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setRouteId(r.route_id);
                              setRouteSearch("");
                              setRouteDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${r.route_id === routeId ? "bg-blue-50 font-medium text-rtd-blue" : "text-gray-700"}`}
                          >
                            <span className="font-medium">{r.short_name}</span>
                            <span className="ml-1.5 text-gray-400">— {r.long_name}</span>
                          </button>
                        </li>
                      ))}
                    </>
                  )}
                  {groupedRoutes.other.length > 0 && (
                    <>
                      <li className="border-t border-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Other
                      </li>
                      {groupedRoutes.other.map((r) => (
                        <li key={r.route_id}>
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setRouteId(r.route_id);
                              setRouteSearch("");
                              setRouteDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${r.route_id === routeId ? "bg-blue-50 font-medium text-rtd-blue" : "text-gray-700"}`}
                          >
                            <span className="font-medium">{r.short_name}</span>
                            <span className="ml-1.5 text-gray-400">— {r.long_name}</span>
                          </button>
                        </li>
                      ))}
                    </>
                  )}
                  {groupedRoutes.rail.length === 0 &&
                    groupedRoutes.bus.length === 0 &&
                    groupedRoutes.other.length === 0 && (
                      <li className="px-3 py-2 text-sm text-gray-400">No routes found</li>
                    )}
                </ul>
              )}
            </div>
          </div>

          <button
            onClick={handleLoad}
            disabled={!isValidRange}
            className={`rounded px-4 py-1.5 text-sm font-medium text-white transition-colors ${
              isValidRange
                ? "bg-rtd-blue hover:bg-rtd-blue/90"
                : "cursor-not-allowed bg-gray-300"
            }`}
          >
            Load trips
          </button>
        </div>
      </Card>

      {/* Vehicles table */}
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
                  <th className="px-3 py-2 text-left">From → To</th>
                  <th className="px-3 py-2 text-left">Start Time</th>
                  <th className="px-3 py-2 text-left">End Time</th>
                  <th className="px-3 py-2 text-right">Duration</th>
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
                    <td className="px-3 py-2 text-gray-600">
                      <span className="whitespace-nowrap">
                        {v.start_stop_name ?? "—"}
                        <span className="px-1 text-gray-400">→</span>
                        {v.end_stop_name ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {new Date(v.start_time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {new Date(v.end_time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600">
                      {formatDuration(v.start_time, v.end_time)}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {OCCUPANCY_SHORT[v.last_occupancy_status ?? "UNKNOWN"] ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {v.observation_count}
                    </td>
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

export default function TripsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl px-4 py-6">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      }
    >
      <TripsContent />
    </Suspense>
  );
}

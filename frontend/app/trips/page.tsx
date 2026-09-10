"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useActiveVehicles, useLimits, useRoutes, useVehicles } from "@/lib/hooks";
import { Card, SectionHeading } from "@/components/ui/Card";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ExportButton from "@/components/ui/ExportButton";
import TripStatusBadge from "@/components/ui/TripStatusBadge";
import DateTimePicker from "@/components/ui/DateTimePicker";
import { computeTripStatus, formatDateTime, isTripInProgress, routeColor } from "@/lib/utils";
import {
  DEFAULT_RANGE_LIMITS,
  clampLocal,
  describeLimits,
  fromLocalInput,
  isoToLocalInput,
  localInputToIso,
  rangeBounds,
  toLocalInput,
  type RangeLimits,
} from "@/lib/dateRange";
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

function TripsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlRouteId = searchParams.get("route_id");
  const urlStrict = searchParams.get("strict") === "true";

  const [startLocal, setStartLocal] = useState(() =>
    urlStart ? isoToLocalInput(urlStart) : toLocalInput(new Date(Date.now() - 3_600_000)),
  );
  const [endLocal, setEndLocal] = useState(() =>
    urlEnd ? isoToLocalInput(urlEnd) : toLocalInput(new Date()),
  );
  const [routeId, setRouteId] = useState(urlRouteId ?? "");
  const [strict, setStrict] = useState(urlStrict);
  const [routeSearch, setRouteSearch] = useState("");
  const [routeDropdownOpen, setRouteDropdownOpen] = useState(false);
  const routeComboRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE_OPTIONS = [15, 30, 50, 100] as const;
  const [pageSize, setPageSize] = useState<number>(15);
  const [page, setPage] = useState(1);

  // Sync picker state when URL params change (e.g. after "Load trips" or browser back/forward)
  useEffect(() => {
    if (urlStart) setStartLocal(isoToLocalInput(urlStart));
    if (urlEnd) setEndLocal(isoToLocalInput(urlEnd));
    setRouteId(urlRouteId ?? "");
    setStrict(urlStrict);
    setPage(1);
  }, [urlStart, urlEnd, urlRouteId, urlStrict]);

  // ── Selectable date window ────────────────────────────────────────────────
  // The API rejects a range that is inverted, wider than vehicles_max_span_hours,
  // or older than the hypertable's retention. Rather than let someone pick such a
  // range and read the error afterwards, we hand those same limits to the pickers
  // so the impossible days come up greyed out.
  const limitsQuery = useLimits();
  const limits: RangeLimits = useMemo(
    () =>
      limitsQuery.data
        ? {
            maxSpanHours: limitsQuery.data.vehicles_max_span_hours,
            retentionDays: limitsQuery.data.data_retention_days,
          }
        : DEFAULT_RANGE_LIMITS,
    [limitsQuery.data],
  );

  // "Now" is the upper bound of every field, so keep it fresh — but on a minute
  // tick, not per render, or the bounds would churn on every keystroke elsewhere.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const bounds = useMemo(
    () => rangeBounds(startLocal, limits, now),
    [startLocal, limits, now],
  );

  // Moving the start re-anchors the window, which can leave the end more than
  // maxSpanHours away or in the future. Pull it back in silently, instead of
  // greying out every earlier date and trapping someone who wants an older day.
  useEffect(() => {
    const clamped = clampLocal(endLocal, bounds.end);
    if (clamped !== endLocal) setEndLocal(clamped);
  }, [endLocal, bounds.end]);

  function handleStartChange(value: string) {
    setStartLocal(clampLocal(value, bounds.start));
  }

  function handleEndChange(value: string) {
    setEndLocal(clampLocal(value, bounds.end));
  }

  const defaultStart = useMemo(() => new Date(Date.now() - 3_600_000).toISOString(), []);
  const defaultEnd = useMemo(() => new Date().toISOString(), []);

  const fetchStart = urlStart ?? defaultStart;
  const fetchEnd = urlEnd ?? defaultEnd;
  const fetchRouteId = urlRouteId ?? undefined;

  const routes = useRoutes();
  const { data, isLoading, isError } = useActiveVehicles({
    start: fetchStart,
    end: fetchEnd,
    route_id: fetchRouteId,
    strict: urlStrict,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  // Cross-reference the live realtime feed so each row can show whether its
  // trip is still in progress or already complete.
  const live = useVehicles();

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

  // The pickers can no longer produce an invalid range, but a stale URL or a
  // hand-typed value on the native mobile control still can — so keep the guard.
  const isValidRange = useMemo(() => {
    const s = fromLocalInput(startLocal);
    const e = fromLocalInput(endLocal);
    if (!s || !e || s >= e) return false;
    return e.getTime() - s.getTime() <= limits.maxSpanHours * 3_600_000;
  }, [startLocal, endLocal, limits.maxSpanHours]);

  function handleLoad() {
    const startIso = localInputToIso(startLocal);
    const endIso = localInputToIso(endLocal);
    if (!startIso || !endIso) return;
    setPage(1);
    const qs = new URLSearchParams({ start: startIso, end: endIso });
    if (routeId) qs.set("route_id", routeId);
    if (strict) qs.set("strict", "true");
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
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-6 pt-24 text-fg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg">Trip Explorer</h1>
          <p className="text-sm text-fg-subtle">
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
          <DateTimePicker
            id="trips-start"
            label="Start"
            value={startLocal}
            onChange={handleStartChange}
            bounds={bounds.start}
          />
          <DateTimePicker
            id="trips-end"
            label="End"
            value={endLocal}
            onChange={handleEndChange}
            bounds={bounds.end}
          />

          {/* Route combobox */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-fg-subtle">Route</label>
            <div ref={routeComboRef} className="relative">
              <div className="flex items-center gap-1 rounded border border-line bg-card px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-accent">
                <svg
                  className="h-3.5 w-3.5 shrink-0 text-fg-subtle"
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
                  className="w-44 bg-transparent outline-none text-fg placeholder-fg-subtle"
                />
                {routeId && (
                  <button
                    onClick={() => {
                      setRouteId("");
                      setRouteSearch("");
                      setRouteDropdownOpen(false);
                    }}
                    aria-label="Clear route filter"
                    className="shrink-0 text-fg-subtle hover:text-fg-muted"
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
                <ul className="absolute left-0 top-full z-50 mt-1 max-h-64 w-64 overflow-y-auto rounded border border-line bg-card shadow-card">
                  <li>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setRouteId("");
                        setRouteSearch("");
                        setRouteDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-fg-subtle hover:bg-raised"
                    >
                      All routes
                    </button>
                  </li>
                  {groupedRoutes.rail.length > 0 && (
                    <>
                      <li className="border-t border-line px-3 py-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
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
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-raised ${r.route_id === routeId ? "bg-accent/10 font-medium text-accent" : "text-fg-muted"}`}
                          >
                            <span className="font-medium">{r.short_name}</span>
                            <span className="ml-1.5 text-fg-subtle">— {r.long_name}</span>
                          </button>
                        </li>
                      ))}
                    </>
                  )}
                  {groupedRoutes.bus.length > 0 && (
                    <>
                      <li className="border-t border-line px-3 py-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
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
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-raised ${r.route_id === routeId ? "bg-accent/10 font-medium text-accent" : "text-fg-muted"}`}
                          >
                            <span className="font-medium">{r.short_name}</span>
                            <span className="ml-1.5 text-fg-subtle">— {r.long_name}</span>
                          </button>
                        </li>
                      ))}
                    </>
                  )}
                  {groupedRoutes.other.length > 0 && (
                    <>
                      <li className="border-t border-line px-3 py-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
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
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-raised ${r.route_id === routeId ? "bg-accent/10 font-medium text-accent" : "text-fg-muted"}`}
                          >
                            <span className="font-medium">{r.short_name}</span>
                            <span className="ml-1.5 text-fg-subtle">— {r.long_name}</span>
                          </button>
                        </li>
                      ))}
                    </>
                  )}
                  {groupedRoutes.rail.length === 0 &&
                    groupedRoutes.bus.length === 0 &&
                    groupedRoutes.other.length === 0 && (
                      <li className="px-3 py-2 text-sm text-fg-subtle">No routes found</li>
                    )}
                </ul>
              )}
            </div>
          </div>

          <button
            onClick={handleLoad}
            disabled={!isValidRange}
            className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
              isValidRange
                ? "bg-accent text-accent-ink hover:opacity-90"
                : "cursor-not-allowed bg-raised text-fg-subtle"
            }`}
          >
            Load trips
          </button>
        </div>

        <p className="mt-3 text-xs text-fg-subtle">{describeLimits(limits)}</p>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={strict}
            onChange={(e) => setStrict(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
          />
          Only include trips strictly within this timeframe
        </label>
      </Card>

      {/* Vehicles table */}
      <Card>
        <SectionHeading
          title="Vehicles"
          subtitle="Click a row to see the vehicle's stop-by-stop timeline"
        />

        {isLoading && <LoadingSpinner />}

        {isError && (
          <p className="py-8 text-center text-sm text-danger">
            Failed to load vehicles. The time window may be out of range.
          </p>
        )}

        {!isLoading && !isError && data?.vehicles.length === 0 && (
          <p className="py-8 text-center text-sm text-fg-subtle">
            No vehicle data found for this time window.
          </p>
        )}

        {!isLoading && !isError && (data?.vehicles.length ?? 0) > 0 && (
          <>
            <div className="overflow-x-auto rounded border border-line">
              <table className="min-w-full text-sm text-fg-muted">
                <thead className="bg-raised text-xs uppercase text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Route</th>
                    <th className="px-3 py-2 text-left">Vehicle</th>
                    <th className="w-[600px] px-3 py-2 text-left">From → To</th>
                    <th className="px-3 py-2 text-left">Start Time</th>
                    <th className="px-3 py-2 text-left">End Time</th>
                    <th className="px-3 py-2 text-right">Duration</th>
                    <th className="px-3 py-2 text-left">Occupancy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data!.vehicles.map((v, i) => (
                    <tr
                      key={`${v.vehicle_label ?? ""}-${v.trip_id ?? i}`}
                      className="cursor-pointer hover:bg-accent/10"
                      onClick={() => handleVehicleClick(v)}
                    >
                      <td className="px-3 py-2">
                        <TripStatusBadge
                          variant="dot"
                          status={computeTripStatus(
                            isTripInProgress(live.data?.vehicles, v.vehicle_label, v.trip_id),
                            v.reached_terminus,
                          )}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <RouteBadge shortName={v.route_short_name} color={v.route_color} />
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {v.vehicle_label ? `#${v.vehicle_label}` : "—"}
                      </td>
                      <td className="w-[600px] max-w-[600px] px-3 py-2 text-fg-muted">
                        <span className="block truncate" title={`${v.start_stop_name ?? "—"} → ${v.end_stop_name ?? "—"}`}>
                          {v.start_stop_name ?? "—"}
                          <span className="px-1 text-fg-subtle">→</span>
                          {v.end_stop_name ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-fg-muted">
                        {new Date(v.start_time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 text-fg-muted">
                        {new Date(v.end_time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-fg-muted">
                        {formatDuration(v.start_time, v.end_time)}
                      </td>
                      <td className="px-3 py-2 text-fg-muted">
                        {OCCUPANCY_SHORT[v.last_occupancy_status ?? "UNKNOWN"] ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {(() => {
              const totalCount = data!.vehicle_count;
              const totalPages = Math.ceil(totalCount / pageSize);
              const start = (page - 1) * pageSize + 1;
              const end = Math.min(page * pageSize, totalCount);
              return (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted">
                  <span>
                    {start}–{end} of {totalCount} trips
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-fg-subtle">Rows per page</label>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setPage(1);
                        }}
                        className="rounded border border-line bg-card px-2 py-1 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="rounded border border-line px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 hover:bg-raised"
                      >
                        ‹ Prev
                      </button>
                      <span className="px-1 text-xs">
                        Page {page} of {totalPages}
                      </span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="rounded border border-line px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 hover:bg-raised"
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </Card>
    </div>
  );
}

export default function TripsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-24">
          <p className="text-sm text-fg-subtle">Loading…</p>
        </div>
      }
    >
      <TripsContent />
    </Suspense>
  );
}

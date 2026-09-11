"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useActiveVehicles, useLimits, useRoutes, useVehicles } from "@/lib/hooks";
import { Card, SectionHeading } from "@/components/ui/Card";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ExportButton from "@/components/ui/ExportButton";
import TripStatusBadge from "@/components/ui/TripStatusBadge";
import DateTimePicker from "@/components/ui/DateTimePicker";
import TripFilterMenu from "@/components/trips/TripFilterMenu";
import { ActiveFilterChip, FilterIcon } from "@/components/ui/FilterControls";
import {
  cn,
  computeTripStatus,
  formatDateTime,
  isTripInProgress,
  occupancyLabel,
  routeColor,
} from "@/lib/utils";
import {
  EMPTY_TRIP_FILTERS,
  countActiveTripFilters,
  tripFilterChips,
  tripFiltersEqual,
  tripFiltersFromParams,
  tripFiltersToParams,
  tripFiltersToQuery,
  type TripFilters,
} from "@/lib/tripFilters";
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

function formatDuration(minutes: number): string {
  const mins = Math.round(minutes);
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
  // The whole applied set lives in the URL, so a filtered view is shareable and
  // the browser's back button walks it the way it walks the date range. Keyed on
  // the query string rather than the params object, so the memo (and the effect
  // that follows it) only re-runs when the URL genuinely changed.
  const paramsKey = searchParams.toString();
  const appliedFilters = useMemo(
    () => tripFiltersFromParams(new URLSearchParams(paramsKey)),
    [paramsKey],
  );

  const [startLocal, setStartLocal] = useState(() =>
    urlStart ? isoToLocalInput(urlStart) : toLocalInput(new Date(Date.now() - 3_600_000)),
  );
  const [endLocal, setEndLocal] = useState(() =>
    urlEnd ? isoToLocalInput(urlEnd) : toLocalInput(new Date()),
  );
  // Two tiers, narrowing toward the table:
  //   draft — live edits inside the menu, not yet queried
  //   URL   — what's actually being asked for; the only thing the query reads.
  //           "Apply filters" commits the filter set here immediately; "Load
  //           trips" commits a new date/time window (keeping whatever filter
  //           set is already applied).
  const [draft, setDraft] = useState<TripFilters>(appliedFilters);
  const [menuOpen, setMenuOpen] = useState(false);

  const PAGE_SIZE_OPTIONS = [15, 30, 50, 100] as const;
  const [pageSize, setPageSize] = useState<number>(15);
  const [page, setPage] = useState(1);

  // Sync picker state when URL params change (e.g. after "Apply filters",
  // "Load trips", or browser back/forward)
  useEffect(() => {
    if (urlStart) setStartLocal(isoToLocalInput(urlStart));
    if (urlEnd) setEndLocal(isoToLocalInput(urlEnd));
    setDraft(appliedFilters);
    setPage(1);
  }, [urlStart, urlEnd, appliedFilters]);

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

  const { data, isLoading, isError, isFetching } = useActiveVehicles({
    start: fetchStart,
    end: fetchEnd,
    ...tripFiltersToQuery(appliedFilters),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  // Cross-reference the live realtime feed so each row can show whether its
  // trip is still in progress or already complete.
  const live = useVehicles();
  // Static route list — the menu offers every route, not just the ones the
  // current query happened to count.
  const routes = useRoutes();

  const facets = data?.facets;

  const sortedRoutes = useMemo(() => {
    const list = routes.data?.routes ?? [];
    return [...list].sort((a, b) =>
      a.short_name.localeCompare(b.short_name, undefined, { numeric: true }),
    );
  }, [routes.data]);

  // The pickers can no longer produce an invalid range, but a stale URL or a
  // hand-typed value on the native mobile control still can — so keep the guard.
  const isValidRange = useMemo(() => {
    const s = fromLocalInput(startLocal);
    const e = fromLocalInput(endLocal);
    if (!s || !e || s >= e) return false;
    return e.getTime() - s.getTime() <= limits.maxSpanHours * 3_600_000;
  }, [startLocal, endLocal, limits.maxSpanHours]);

  const pushQuery = useCallback(
    (filters: TripFilters, startIso: string, endIso: string) => {
      const qs = new URLSearchParams({ start: startIso, end: endIso });
      for (const [k, v] of Object.entries(tripFiltersToParams(filters))) qs.set(k, v);
      router.push(`/trips?${qs}`);
    },
    [router],
  );

  /** "Load trips" — commits a new date/time window, keeping whatever filter
   *  set is already applied. */
  const handleLoad = useCallback(() => {
    const startIso = localInputToIso(startLocal);
    const endIso = localInputToIso(endLocal);
    if (!startIso || !endIso) return;
    setPage(1);
    setMenuOpen(false);
    pushQuery(appliedFilters, startIso, endIso);
  }, [appliedFilters, startLocal, endLocal, pushQuery]);

  /** "Apply filters" inside the menu — commits the draft immediately and
   *  tucks the menu away, keeping the current date/time window. */
  const applyFilters = useCallback(() => {
    setPage(1);
    setMenuOpen(false);
    pushQuery(draft, fetchStart, fetchEnd);
  }, [draft, fetchStart, fetchEnd, pushQuery]);

  /** Removing a chip / Reset / Clear is an unambiguous instruction too, so it
   *  applies straight away just like "Apply filters" does. */
  const applyImmediately = useCallback(
    (filters: TripFilters) => {
      setDraft(filters);
      setPage(1);
      pushQuery(filters, fetchStart, fetchEnd);
    },
    [fetchStart, fetchEnd, pushQuery],
  );

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
    // Preserve the list's whole query — window and filters — so the breadcrumb
    // returns to the view the row was clicked from, not just its date range.
    const ret = new URLSearchParams({ start: fetchStart, end: fetchEnd });
    for (const [k, val] of Object.entries(tripFiltersToParams(appliedFilters))) ret.set(k, val);
    qs.set("ret", ret.toString());
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

  const routeNameOf = useCallback(
    (routeId: string) =>
      sortedRoutes.find((r) => r.route_id === routeId)?.short_name ??
      facets?.routes.find((r) => r.route_id === routeId)?.route_short_name ??
      undefined,
    [sortedRoutes, facets],
  );

  // Chips mirror the applied filter set — "Apply filters" commits straight
  // to the URL, so the chip row always matches what the table is showing.
  const chips = useMemo(
    () => tripFilterChips(appliedFilters, routeNameOf),
    [appliedFilters, routeNameOf],
  );

  const appliedCount = countActiveTripFilters(appliedFilters);

  const matched = data?.vehicle_count ?? 0;
  const windowTotal = data?.window_count ?? 0;
  // Export still speaks one route at a time, so only offer to scope it when the
  // filter set narrows to exactly that.
  const exportRouteId =
    appliedFilters.routeIds.length === 1 ? appliedFilters.routeIds[0] : undefined;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-6 pt-24 text-fg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg">Trip Explorer</h1>
          <p className="text-sm text-fg-subtle">
            {timeLabel ? `${timeLabel} · ` : ""}
            {/* "N of M" only when something was actually filtered out — a route
                filter runs in SQL, so it narrows both numbers equally. */}
            {isLoading
              ? "Loading…"
              : windowTotal > matched
                ? `${matched} of ${windowTotal} trips`
                : `${matched} trips`}
          </p>
        </div>
        <ExportButton routeId={exportRouteId} start={fetchStart} end={fetchEnd} />
      </div>

      {/* Filter bar */}
      <Card>
        <SectionHeading
          title="Filters"
          hint="Filters apply as soon as you hit Apply filters. Pick a date and time range and hit Load trips to change the window."
        />
        <div className="flex flex-wrap items-end gap-3">
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

          {/* Grouped so the pair moves to its own line as a unit when the row
              wraps, with the filter button staying immediately left of Load
              trips instead of drifting up next to the End field. */}
          <div className="flex items-stretch gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-label="Filter trips"
              className={cn(
                "press flex h-9 items-center gap-1.5 rounded border px-2.5 text-sm font-medium transition-[transform,background-color,border-color,color] duration-150",
                appliedCount > 0 || menuOpen
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-card text-fg-muted hover:border-line-strong hover:text-fg",
              )}
            >
              <FilterIcon className="h-4 w-4" />
              {appliedCount > 0 && (
                <span
                  key={appliedCount}
                  className="animate-badge-pop rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-accent-ink"
                >
                  {appliedCount}
                </span>
              )}
            </button>

            <button
              onClick={handleLoad}
              disabled={!isValidRange}
              className={cn(
                "press h-9 rounded px-4 text-sm font-medium transition-[transform,opacity,background-color,color] duration-150",
                isValidRange
                  ? "bg-accent text-accent-ink hover:opacity-90"
                  : "cursor-not-allowed bg-raised text-fg-subtle",
              )}
            >
              Load trips
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-fg-subtle">{describeLimits(limits)}</p>

        <TripFilterMenu
          open={menuOpen}
          value={draft}
          onChange={setDraft}
          facets={facets}
          routes={sortedRoutes}
          onReset={() => applyImmediately(EMPTY_TRIP_FILTERS)}
          onApply={applyFilters}
          applyDisabled={tripFiltersEqual(draft, appliedFilters)}
        />

        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
            <span className="mr-1 text-xs font-medium text-fg-subtle">Filtering by</span>
            {chips.map((chip) => (
              <ActiveFilterChip
                key={chip.id}
                label={chip.label}
                onRemove={() => applyImmediately(chip.next)}
              />
            ))}
            <button
              type="button"
              onClick={() => applyImmediately(EMPTY_TRIP_FILTERS)}
              className="ml-1 text-xs font-medium text-fg-subtle underline-offset-2 transition-colors hover:text-fg hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </Card>

      {/* Vehicles table */}
      <Card>
        <SectionHeading
          title="Vehicles"
          hint="Click a row to see the vehicle's stop-by-stop timeline."
        />

        {isLoading && <LoadingSpinner />}

        {isError && (
          <p className="py-8 text-center text-sm text-danger">
            Failed to load vehicles. The time window may be out of range.
          </p>
        )}

        {!isLoading && !isError && data?.vehicles.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-fg-subtle">
              {appliedCount > 0 && windowTotal > 0
                ? `None of the ${windowTotal} trips in this window match these filters.`
                : "No vehicle data found for this time window."}
            </p>
            {appliedCount > 0 && (
              <button
                type="button"
                onClick={() => applyImmediately(EMPTY_TRIP_FILTERS)}
                className="mt-2 text-sm font-medium text-accent underline-offset-2 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && (data?.vehicles.length ?? 0) > 0 && (
          <>
            {/* Dimmed, not replaced, while the next page or filter set loads —
                the rows underneath are still the ones that were asked for. */}
            <div
              className={cn(
                "overflow-x-auto rounded border border-line transition-opacity duration-200",
                isFetching && "opacity-60",
              )}
            >
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
                        {/* The API decided the status the filter matched on; the
                            live feed is fresher, so a trip that is still running
                            keeps its blinking dot between refetches. */}
                        <TripStatusBadge
                          variant="dot"
                          status={computeTripStatus(
                            v.in_progress ||
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
                        {formatDuration(v.duration_minutes)}
                      </td>
                      <td className="px-3 py-2 text-fg-muted">
                        {v.last_occupancy_status
                          ? occupancyLabel(v.last_occupancy_status)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {(() => {
              const totalCount = matched;
              const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
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

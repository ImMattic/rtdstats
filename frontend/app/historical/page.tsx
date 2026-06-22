"use client";
import { useState } from "react";
import {
  useHistorical,
  useRoutes,
  useOverview,
  useOnTimeTrend,
  useHeatmap,
  useDistribution,
  useWorstStops,
  useScheduleFrequency,
  useRidership,
  useOccupancy,
} from "@/lib/hooks";
import { cn, formatDelay, formatDateTime, formatDelayMin, formatCompact } from "@/lib/utils";
import ExportButton from "@/components/ui/ExportButton";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { Card, SectionHeading } from "@/components/ui/Card";
import KpiCard from "@/components/dashboard/KpiCard";
import TrendChart from "@/components/charts/TrendChart";
import Heatmap from "@/components/charts/Heatmap";
import DistributionChart from "@/components/charts/DistributionChart";
import HeadwayChart from "@/components/charts/HeadwayChart";
import WorstStopsTable from "@/components/charts/WorstStopsTable";
import RidershipChart from "@/components/charts/RidershipChart";
import OccupancyChart from "@/components/charts/OccupancyChart";
import type { VehicleHistoryPoint } from "@/lib/types";

const STATUS_LABELS: Record<number, string> = { 0: "Arriving", 1: "Stopped", 2: "In transit" };
const DAY_OPTIONS = [7, 14, 30, 90];

function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 16);
}
function nowIso(): string {
  return new Date().toISOString().slice(0, 16);
}

type Mode = "performance" | "raw";

export default function HistoricalPage() {
  const [mode, setMode] = useState<Mode>("performance");
  const routes = useRoutes();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 text-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Historical Analysis</h1>
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
          {(["performance", "raw"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-4 py-1.5 font-medium transition-colors",
                mode === m ? "bg-rtd-blue text-white" : "text-gray-600 hover:text-gray-900",
              )}
            >
              {m === "performance" ? "Route Performance" : "Raw Data Export"}
            </button>
          ))}
        </div>
      </div>

      {mode === "performance" ? (
        <RoutePerformance routes={routes} />
      ) : (
        <RawDataExport routes={routes} />
      )}
    </div>
  );
}

// ── Route performance analytics mode ────────────────────────────────────────

function RoutePerformance({ routes }: { routes: ReturnType<typeof useRoutes> }) {
  const [routeId, setRouteId] = useState<string>("");
  const [days, setDays] = useState(30);
  const rid = routeId || undefined;
  const granularity = days <= 2 ? "hour" : "day";

  const overview = useOverview(days, rid);
  const trend = useOnTimeTrend(days, rid, granularity);
  const heatmap = useHeatmap(days, rid);
  const distribution = useDistribution(days, rid);
  const worstStops = useWorstStops(days, rid);
  const scheduleFreq = useScheduleFrequency(rid);
  const ridership = useRidership(rid);
  const occupancy = useOccupancy(days, rid);

  const ov = overview.data;
  const routeName = routes.data?.routes.find((r) => r.route_id === routeId)?.long_name;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">Route</label>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rtd-blue"
            >
              <option value="">All routes (system-wide)</option>
              {routes.data?.routes.map((r) => (
                <option key={r.route_id} value={r.route_id}>
                  {r.short_name} — {r.long_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 text-sm">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded px-3 py-1 font-medium transition-colors ${
                  days === d
                    ? "bg-rtd-blue text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-rtd-blue"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        {routeName && <p className="mt-2 text-sm text-gray-500">{routeName}</p>}
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="On-Time Rate"
          value={ov ? `${ov.on_time_pct.value.toFixed(1)}%` : "—"}
          delta={ov && ov.on_time_pct.previous != null ? ov.on_time_pct.value - ov.on_time_pct.previous : null}
          deltaSuffix="pts"
          subtitle={`last ${days}d`}
        />
        <KpiCard
          title="Avg Delay"
          value={ov ? formatDelayMin(ov.avg_delay_seconds.value) : "—"}
          subtitle={ov ? `±${(ov.delay_stddev_seconds / 60).toFixed(1)}m spread` : undefined}
        />
        <KpiCard
          title="Service Delivered"
          value={ov ? `${ov.service_delivered_pct.value.toFixed(0)}%` : "—"}
          subtitle={ov ? `${formatCompact(ov.observed_trips)} / ${formatCompact(ov.scheduled_trips)} trips` : undefined}
        />
        <KpiCard
          title="Observations"
          value={ov ? formatCompact(ov.total_observations) : "—"}
          subtitle="delay samples"
        />
      </div>

      <Card>
        <SectionHeading title="On-Time Performance Trend" subtitle={`${granularity === "hour" ? "Hourly" : "Daily"} · 80% target`} />
        {trend.isLoading ? <LoadingSpinner /> : <TrendChart points={trend.data?.points ?? []} granularity={granularity} />}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading title="Reliability by Time" subtitle="On-time % by hour × day of week (Denver time)" />
          {heatmap.isLoading ? <LoadingSpinner /> : <Heatmap cells={heatmap.data?.cells ?? []} metric="ontime" />}
        </Card>
        <Card>
          <SectionHeading
            title="Delay Distribution"
            subtitle={distribution.data ? `Avg ${formatDelayMin(distribution.data.avg_delay_seconds)}` : undefined}
          />
          {distribution.isLoading ? <LoadingSpinner /> : <DistributionChart bins={distribution.data?.bins ?? []} />}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Scheduled Frequency by Hour"
            subtitle={routeId ? "Minutes between vehicles (weekday)" : "Select a route to view"}
          />
          {!routeId ? (
            <p className="py-8 text-center text-sm text-gray-500">Pick a route to see scheduled headways.</p>
          ) : scheduleFreq.isLoading ? (
            <LoadingSpinner />
          ) : (
            <HeadwayChart headways={scheduleFreq.data?.routes[0]?.headways_by_hour ?? []} />
          )}
        </Card>
        <Card>
          <SectionHeading title="Worst Stops by Delay" subtitle="Where riders wait longest past schedule" />
          {worstStops.isLoading ? <LoadingSpinner /> : <WorstStopsTable stops={worstStops.data?.stops ?? []} />}
        </Card>
      </div>

      <Card>
        <SectionHeading title="Ridership" subtitle="Imported monthly boardings (RTD/NTD)" />
        {ridership.isLoading ? <LoadingSpinner /> : ridership.data ? <RidershipChart data={ridership.data} /> : null}
      </Card>

      <Card>
        <SectionHeading title="Live Crowding (Occupancy)" subtitle="Real-time demand proxy from GTFS-RT" />
        {occupancy.isLoading ? <LoadingSpinner /> : occupancy.data ? <OccupancyChart data={occupancy.data} /> : null}
      </Card>
    </div>
  );
}

// ── Raw data export mode (preserved) ────────────────────────────────────────

function RawDataExport({ routes }: { routes: ReturnType<typeof useRoutes> }) {
  const [routeId, setRouteId] = useState("");
  const [start, setStart] = useState(todayMinus(1));
  const [end, setEnd] = useState(nowIso());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(200);
  const [submitted, setSubmitted] = useState(false);

  const history = useHistorical(
    submitted ? { route_id: routeId || undefined, start, end, limit, page } : {},
  );
  const rows: VehicleHistoryPoint[] = history.data?.vehicles ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Route</label>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rtd-blue"
            >
              <option value="">All routes</option>
              {routes.data?.routes.map((r) => (
                <option key={r.route_id} value={r.route_id}>
                  {r.short_name} - {r.long_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rtd-blue"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rtd-blue"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Rows per page</label>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rtd-blue"
            >
              {[50, 100, 200, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              setPage(1);
              setSubmitted(true);
            }}
            className="rounded bg-rtd-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rtd-blue/90"
          >
            Search
          </button>
        </div>
      </Card>

      {submitted && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">
              {history.isLoading
                ? "Loading…"
                : `${history.data?.returned ?? 0} records on page ${history.data?.page ?? page}`}
            </h2>
            <ExportButton
              routeId={routeId || undefined}
              start={start ? new Date(start).toISOString() : undefined}
              end={end ? new Date(end).toISOString() : undefined}
            />
          </div>

          {!history.isLoading && history.data && (
            <div className="mb-4 flex items-center justify-between text-sm text-gray-600">
              <span>
                Showing {history.data.returned} of {history.data.total ?? history.data.returned} rows
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={(history.data.page ?? page) <= 1}
                  className="rounded border border-gray-200 px-3 py-1 disabled:opacity-50"
                >
                  Previous
                </button>
                <span>
                  Page {history.data.page ?? page} / {history.data.total_pages ?? 1}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(history.data.page ?? page) >= (history.data.total_pages ?? 1)}
                  className="rounded border border-gray-200 px-3 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {history.isLoading ? (
            <LoadingSpinner />
          ) : history.isError ? (
            <p className="text-sm text-red-500">Failed to fetch historical data.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500">No data found for this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-gray-800">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Route</th>
                    <th className="px-3 py-2 text-left">Vehicle</th>
                    <th className="px-3 py-2 text-left">Stop</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Delay</th>
                    <th className="px-3 py-2 text-right">Lat</th>
                    <th className="px-3 py-2 text-right">Lon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-3 py-2 text-gray-500">{formatDateTime(r.timestamp)}</td>
                      <td className="px-3 py-2 font-bold text-gray-900">{r.route_short_name || r.route_id}</td>
                      <td className="px-3 py-2 text-gray-700">{r.vehicle_label ?? r.vehicle_id ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{r.stop_id ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{STATUS_LABELS[r.current_status ?? -1] ?? "—"}</td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${
                          (r.delay_seconds ?? 0) > 300
                            ? "text-red-600"
                            : (r.delay_seconds ?? 0) < -60
                              ? "text-yellow-600"
                              : "text-green-700"
                        }`}
                      >
                        {formatDelay(r.delay_seconds)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500">{r.latitude?.toFixed(4) ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500">{r.longitude?.toFixed(4) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

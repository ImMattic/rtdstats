"use client";
import { useState } from "react";
import {
  useOverview,
  useOnTime,
  useOnTimeTrend,
  useHeatmap,
  useDistribution,
  useWorstStops,
  useFrequency,
  useScheduleFrequency,
  useOccupancy,
  useAlerts,
  useRoutes,
} from "@/lib/hooks";
import { Card, SectionHeading } from "@/components/ui/Card";
import KpiCard from "@/components/dashboard/KpiCard";
import FrequencyTable from "@/components/dashboard/FrequencyTable";
import DelayIncidents from "@/components/dashboard/DelayIncidents";
import TrendChart from "@/components/charts/TrendChart";
import Heatmap from "@/components/charts/Heatmap";
import DistributionChart from "@/components/charts/DistributionChart";
import ScorecardTable from "@/components/charts/ScorecardTable";
import HeadwayChart from "@/components/charts/HeadwayChart";
import OccupancyChart from "@/components/charts/OccupancyChart";
import WorstStopsTable from "@/components/charts/WorstStopsTable";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatCompact, formatDelayMin } from "@/lib/utils";

const DAY_OPTIONS = [1, 7, 14, 30, 90];

function fmtSpan(hhmm: string | null | undefined): string {
  if (!hhmm) return "—";
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m}${suffix}`;
}

function delta(m?: { value: number; previous: number | null }): number | null {
  if (!m || m.previous === null || m.previous === undefined) return null;
  return m.value - m.previous;
}

export default function DashboardPage() {
  const [days, setDays] = useState(7);
  const [routeId, setRouteId] = useState<string>("");
  const [occDirection, setOccDirection] = useState<number | undefined>(undefined);
  const rid = routeId || undefined;
  const granularity = days <= 2 ? "hour" : "day";

  const routes = useRoutes();
  const overview = useOverview(days, rid);
  const alerts = useAlerts();
  const trend = useOnTimeTrend(days, rid, granularity);
  const heatmap = useHeatmap(Math.max(days, 14), rid);
  const distribution = useDistribution(days, rid);
  const scorecard = useOnTime(days, rid);
  const worstStops = useWorstStops(days, rid);
  const frequency = useFrequency(rid);
  const scheduleFreq = useScheduleFrequency(rid);
  const occupancy = useOccupancy(days, rid, occDirection);

  const ov = overview.data;
  const alertCount = alerts.data?.alerts.length ?? 0;
  const selectedRouteName =
    routes.data?.routes.find((r) => r.route_id === routeId)?.short_name;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 text-gray-900">
      {/* Header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Transit Performance Dashboard</h1>
          <p className="text-sm text-gray-500">
            Reliability, frequency, service delivery &amp; demand across RTD
            {selectedRouteName ? ` · Route ${selectedRouteName}` : " · all routes"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rtd-blue"
          >
            <option value="">All routes</option>
            {routes.data?.routes.map((r) => (
              <option key={r.route_id} value={r.route_id}>
                {r.short_name} — {r.long_name}
              </option>
            ))}
          </select>
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
          <button
            onClick={() => typeof window !== "undefined" && window.print()}
            className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:border-rtd-blue print:hidden"
          >
            Print report
          </button>
        </div>
      </div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="On-Time Rate"
          value={ov ? `${ov.on_time_pct.value.toFixed(1)}%` : "—"}
          delta={delta(ov?.on_time_pct)}
          deltaSuffix="pts"
          subtitle={`vs prior ${days}d`}
          accentColor={
            ov ? (ov.on_time_pct.value >= 80 ? "#16a34a" : ov.on_time_pct.value >= 60 ? "#ea580c" : "#dc2626") : undefined
          }
        />
        <KpiCard
          title="Avg Delay"
          value={ov ? formatDelayMin(ov.avg_delay_seconds.value) : "—"}
          delta={delta(ov?.avg_delay_seconds) != null ? (delta(ov?.avg_delay_seconds) as number) / 60 : null}
          deltaSuffix="m"
          lowerIsBetter
          subtitle={ov ? `±${(ov.delay_stddev_seconds / 60).toFixed(1)}m spread` : undefined}
        />
        <KpiCard
          title="Monthly Ridership"
          value={ov?.latest_ridership_total != null ? formatCompact(ov.latest_ridership_total) : "—"}
          delta={
            ov?.latest_ridership_total != null && ov?.prev_ridership_total != null && ov.prev_ridership_total > 0
              ? ((ov.latest_ridership_total - ov.prev_ridership_total) / ov.prev_ridership_total) * 100
              : null
          }
          deltaSuffix="%"
          subtitle={ov?.latest_ridership_month ? `boardings · ${ov.latest_ridership_month}` : "no ridership data"}
          accentColor="#002F87"
        />
        <KpiCard
          title="Standing Room+"
          value={occupancy.data?.reported ? `${(occupancy.data.standing_pct ?? 0).toFixed(0)}%` : "—"}
          subtitle={
            occupancy.data?.reported
              ? `of observations · last ${days}d`
              : "no occupancy data"
          }
          accentColor={
            occupancy.data?.reported
              ? (occupancy.data.standing_pct ?? 0) > 30
                ? "#dc2626"
                : (occupancy.data.standing_pct ?? 0) > 15
                  ? "#ea580c"
                  : "#16a34a"
              : undefined
          }
        />
      </div>

      {/* Secondary KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard title="Routes Tracked" value={ov ? String(ov.routes_tracked) : "—"} subtitle="with delay data" />
        <KpiCard
          title="Observations"
          value={ov ? formatCompact(ov.total_observations) : "—"}
          subtitle={`last ${days}d`}
        />
        <KpiCard
          title="Stuck Alerts"
          value={alerts.isLoading ? "…" : String(alertCount)}
          subtitle="live"
          accentColor={alertCount > 0 ? "#dc2626" : "#16a34a"}
        />
        <KpiCard
          title="Delay Consistency"
          value={ov ? `±${(ov.delay_stddev_seconds / 60).toFixed(1)}m` : "—"}
          subtitle="lower = predictable"
        />
      </div>

      {/* ── Reliability ─────────────────────────────────────────────── */}
      <h2 className="pt-2 text-lg font-bold text-gray-400">Reliability</h2>

      <Card>
        <SectionHeading
          title="On-Time Performance Trend"
          subtitle={`${granularity === "hour" ? "Hourly" : "Daily"} on-time rate (bars: avg delay) · 80% target line`}
        />
        {trend.isLoading ? <LoadingSpinner /> : <TrendChart points={trend.data?.points ?? []} granularity={granularity} />}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading title="When Is Service Reliable?" subtitle="On-time % by hour × day of week (Denver time)" />
          {heatmap.isLoading ? <LoadingSpinner /> : <Heatmap cells={heatmap.data?.cells ?? []} metric="ontime" />}
        </Card>
        <Card>
          <SectionHeading
            title="Delay Distribution"
            subtitle={
              distribution.data
                ? `Avg ${formatDelayMin(distribution.data.avg_delay_seconds)} · ±${(distribution.data.stddev_seconds / 60).toFixed(1)}m`
                : "How early/late arrivals fall"
            }
          />
          {distribution.isLoading ? <LoadingSpinner /> : <DistributionChart bins={distribution.data?.bins ?? []} />}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading title="Route Reliability Scorecard" subtitle="Click a route to filter the whole dashboard" />
          {scorecard.isLoading ? (
            <LoadingSpinner />
          ) : (
            <ScorecardTable routes={scorecard.data?.routes ?? []} onSelectRoute={setRouteId} />
          )}
        </Card>
        <Card>
          <SectionHeading title="Worst Stops by Delay" subtitle="Where riders wait longest past schedule" />
          {worstStops.isLoading ? <LoadingSpinner /> : <WorstStopsTable stops={worstStops.data?.stops ?? []} />}
        </Card>
      </div>

      {/* ── Frequency & Service Delivery ────────────────────────────── */}
      <h2 className="pt-2 text-lg font-bold text-gray-400">Frequency &amp; Service Delivery</h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Scheduled Frequency by Hour"
            subtitle={
              routeId && scheduleFreq.data?.routes[0]
                ? `Minutes between vehicles (weekday) · Service ${fmtSpan(scheduleFreq.data.routes[0].span_start)} – ${fmtSpan(scheduleFreq.data.routes[0].span_end)}`
                : "Select a route to view"
            }
          />
          {!routeId ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Pick a route above to see its scheduled headways through the day.
            </p>
          ) : scheduleFreq.isLoading ? (
            <LoadingSpinner />
          ) : (
            <HeadwayChart headways={scheduleFreq.data?.routes[0]?.headways_by_hour ?? []} />
          )}
        </Card>
        <Card>
          <SectionHeading title="Current Frequency (Live)" subtitle="Estimated headway from active vehicles" />
          {frequency.isLoading ? <LoadingSpinner /> : <FrequencyTable routes={frequency.data?.routes ?? []} />}
        </Card>
      </div>

      {/* ── Live Demand ─────────────────────────────────────────────── */}
      <h2 className="pt-2 text-lg font-bold text-gray-400">Live Demand</h2>

      <Card>
        <SectionHeading
          title="Live Crowding"
          subtitle={
            routeId && scheduleFreq.data?.routes[0]
              ? `GTFS-RT occupancy · Service ${fmtSpan(scheduleFreq.data.routes[0].span_start)} – ${fmtSpan(scheduleFreq.data.routes[0].span_end)}`
              : "GTFS-RT occupancy status codes · % of observations by hour"
          }
        />
        {occupancy.isLoading ? (
          <LoadingSpinner />
        ) : occupancy.data ? (
          <OccupancyChart
            data={occupancy.data}
            direction={occDirection}
            onDirectionChange={setOccDirection}
          />
        ) : null}
      </Card>

      {/* ── Live alerts ─────────────────────────────────────────────── */}
      <Card>
        <SectionHeading title="Stuck Vehicle Alerts" subtitle="Vehicles stationary beyond the alert threshold" />
        {alerts.isLoading ? <LoadingSpinner /> : <DelayIncidents alerts={alerts.data?.alerts ?? []} />}
      </Card>
    </div>
  );
}

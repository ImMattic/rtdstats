"use client";
import { useState } from "react";
import { useOnTime, useFrequency, useAlerts } from "@/lib/hooks";
import StatsCard from "@/components/dashboard/StatsCard";
import OnTimeChart from "@/components/dashboard/OnTimeChart";
import FrequencyTable from "@/components/dashboard/FrequencyTable";
import DelayIncidents from "@/components/dashboard/DelayIncidents";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

const DAY_OPTIONS = [1, 7, 14, 30];

export default function DashboardPage() {
  const [days, setDays] = useState(7);

  const onTime = useOnTime(days);
  const frequency = useFrequency();
  const alerts = useAlerts();

  const overall = onTime.data?.overall;
  const alertCount = alerts.data?.alerts.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 space-y-8 text-gray-900">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        {/* Period selector */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Period:</span>
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

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatsCard
          title="On-Time Rate"
          value={
            onTime.isLoading
              ? "…"
              : overall
                ? `${overall.on_time_pct.toFixed(1)}%`
                : "—"
          }
          subtitle={`Last ${days} day${days !== 1 ? "s" : ""}`}
          accent={
            overall
              ? overall.on_time_pct >= 80
                ? "green"
                : overall.on_time_pct >= 60
                  ? "orange"
                  : "red"
              : "default"
          }
        />
        <StatsCard
          title="Avg Delay"
          value={
            overall
              ? overall.avg_delay_seconds > 0
                ? `+${Math.round(overall.avg_delay_seconds)}s`
                : `${Math.round(overall.avg_delay_seconds)}s`
              : "—"
          }
          subtitle="Arrival delay"
        />
        <StatsCard
          title="Routes Tracked"
          value={onTime.data?.routes.length ?? "—"}
          subtitle="With delay data"
          accent="blue"
        />
        <StatsCard
          title="Stuck Alerts"
          value={alerts.isLoading ? "…" : alertCount}
          subtitle={`>${5} min stationary`}
          accent={alertCount > 0 ? "red" : "green"}
        />
      </div>

      {/* On-time by route */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">On-Time Performance by Route</h2>
        {onTime.isLoading ? (
          <LoadingSpinner />
        ) : onTime.isError ? (
          <p className="text-sm text-red-500">Failed to load on-time data.</p>
        ) : (
          <OnTimeChart routes={onTime.data?.routes ?? []} />
        )}
      </section>

      {/* Frequency */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">Current Frequency</h2>
        {frequency.isLoading ? (
          <LoadingSpinner />
        ) : frequency.isError ? (
          <p className="text-sm text-red-500">Failed to load frequency data.</p>
        ) : (
          <FrequencyTable routes={frequency.data?.routes ?? []} />
        )}
      </section>

      {/* Stuck vehicle alerts */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">Stuck Vehicle Alerts</h2>
        {alerts.isLoading ? (
          <LoadingSpinner />
        ) : alerts.isError ? (
          <p className="text-sm text-red-500">Failed to load alerts.</p>
        ) : (
          <DelayIncidents alerts={alerts.data?.alerts ?? []} />
        )}
      </section>
    </div>
  );
}

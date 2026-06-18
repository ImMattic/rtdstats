"use client";
import { useState } from "react";
import { useHistorical, useRoutes } from "@/lib/hooks";
import { formatDelay, formatDateTime } from "@/lib/utils";
import ExportButton from "@/components/ui/ExportButton";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import type { VehicleHistoryPoint } from "@/lib/types";

const STATUS_LABELS: Record<number, string> = {
  0: "Arriving",
  1: "Stopped",
  2: "In transit",
};

function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  // Return in local YYYY-MM-DDTHH:mm format for datetime-local inputs
  return d.toISOString().slice(0, 16);
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 16);
}

export default function HistoricalPage() {
  const [routeId, setRouteId] = useState("");
  const [start, setStart] = useState(todayMinus(1));
  const [end, setEnd] = useState(nowIso());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(200);
  const [submitted, setSubmitted] = useState(false);

  const routes = useRoutes();
  const history = useHistorical(
    submitted ? { route_id: routeId || undefined, start, end, limit, page } : {},
  );

  const rows: VehicleHistoryPoint[] = history.data?.vehicles ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 space-y-6 text-gray-900">
      <h1 className="text-2xl font-bold">Historical Data</h1>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 items-end">
          {/* Route */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Route</label>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rtd-blue"
            >
              <option value="">All routes</option>
              {routes.isLoading && <option disabled>Loading routes...</option>}
              {routes.isError && <option disabled>Failed to load routes</option>}
              {!routes.isLoading && !routes.isError && routes.data?.routes.map((r) => (
                <option key={r.route_id} value={r.route_id}>
                  {r.short_name} - {r.long_name}
                </option>
              ))}
            </select>
          </div>

          {/* Start */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rtd-blue"
            />
          </div>

          {/* End */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rtd-blue"
            />
          </div>

          {/* Rows per page */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Rows per page</label>
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

          {/* Submit */}
          <button
            onClick={() => {
              setPage(1);
              setSubmitted(true);
            }}
            className="rounded bg-rtd-blue px-4 py-2 text-sm font-medium text-white hover:bg-rtd-blue/90 transition-colors"
          >
            Search
          </button>
        </div>
      </div>

      {/* Results */}
      {submitted && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
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
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                        {formatDateTime(r.timestamp)}
                      </td>
                      <td className="px-3 py-2 font-bold text-gray-900">{r.route_short_name || r.route_id}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.vehicle_label ?? r.vehicle_id ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.stop_id ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {STATUS_LABELS[r.current_status ?? -1] ?? "—"}
                      </td>
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
                      <td className="px-3 py-2 text-right font-mono text-gray-500">
                        {r.latitude?.toFixed(4) ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500">
                        {r.longitude?.toFixed(4) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import type { WorstStop } from "@/lib/types";
import { cn, formatDelayMin, formatNumber, onTimeColor } from "@/lib/utils";

const PAGE_SIZE = 10;

interface Props {
  stops: WorstStop[];
}

/** Stops ranked by average arrival delay — where riders wait longest. */
export default function WorstStopsTable({ stops }: Props) {
  const [page, setPage] = useState(0);

  if (!stops.length) {
    return <p className="py-6 text-center text-sm text-gray-500">No stop-level delay data yet.</p>;
  }

  const totalPages = Math.ceil(stops.length / PAGE_SIZE);
  const pageRows = stops.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm text-gray-800">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Stop</th>
              <th className="px-3 py-2 text-right">Avg delay</th>
              <th className="px-3 py-2 text-right">On-time</th>
              <th className="px-3 py-2 text-right">Samples</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pageRows.map((s, i) => (
              <tr key={`${s.stop_id}-${i}`} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-400">{page * PAGE_SIZE + i + 1}</td>
                <td className="px-3 py-2">
                  <span className="font-medium text-gray-900">{s.stop_name ?? s.stop_id}</span>
                  {s.stop_name && <span className="ml-1 text-xs text-gray-400">#{s.stop_id}</span>}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono font-semibold",
                    s.avg_delay_seconds > 300 ? "text-red-600" : "text-gray-700",
                  )}
                >
                  {formatDelayMin(s.avg_delay_seconds)}
                </td>
                <td className="px-3 py-2 text-right font-mono" style={{ color: onTimeColor(s.on_time_pct) }}>
                  {s.on_time_pct.toFixed(0)}%
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-400">
                  {formatNumber(s.observations)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-xs text-gray-500">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE + PAGE_SIZE, stops.length)} of{" "}
            {stops.length}
          </span>
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
            className="px-2 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ‹
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
            className="px-2 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

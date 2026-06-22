"use client";
import type { WorstStop } from "@/lib/types";
import { cn, formatDelayMin, formatNumber, onTimeColor } from "@/lib/utils";

interface Props {
  stops: WorstStop[];
}

/** Stops ranked by average arrival delay — where riders wait longest. */
export default function WorstStopsTable({ stops }: Props) {
  if (!stops.length) {
    return <p className="py-6 text-center text-sm text-gray-500">No stop-level delay data yet.</p>;
  }

  return (
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
          {stops.map((s, i) => (
            <tr key={`${s.stop_id}-${i}`} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
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
  );
}

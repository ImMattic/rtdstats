"use client";
import type { WorstStop } from "@/lib/types";
import { cn, formatDelayMin, formatNumber, onTimeColor } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";

interface Props {
  stops: WorstStop[];
}

/** Stops ranked by average arrival delay — where riders wait longest. */
export default function WorstStopsTable({ stops }: Props) {
  const { resolvedTheme } = useTheme();

  if (!stops.length) {
    return <p className="py-6 text-center text-sm text-fg-subtle">No stop-level delay data yet.</p>;
  }

  return (
    // Five columns, but the Stop name is the only one with unbounded width — truncate
    // it (full name still available via the row) and shrink padding/text so the rest
    // fits the phone width instead of forcing a scroll.
    <div className="overflow-x-auto rounded border border-line">
      <table className="min-w-full text-xs text-fg-muted sm:text-sm">
        <thead className="bg-raised text-[10px] uppercase text-fg-subtle sm:text-xs">
          <tr>
            <th className="px-2 py-1.5 text-left sm:px-3 sm:py-2">#</th>
            <th className="px-2 py-1.5 text-left sm:px-3 sm:py-2">Stop</th>
            <th className="px-2 py-1.5 text-right sm:px-3 sm:py-2">Avg delay</th>
            <th className="px-2 py-1.5 text-right sm:px-3 sm:py-2">On-time</th>
            <th className="px-2 py-1.5 text-right sm:px-3 sm:py-2">
              <span className="sm:hidden">Samp.</span>
              <span className="hidden sm:inline">Samples</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {stops.map((s, i) => (
            <tr key={`${s.stop_id}-${i}`} className="hover:bg-raised">
              <td className="px-2 py-1.5 text-fg-subtle sm:px-3 sm:py-2">{i + 1}</td>
              <td className="max-w-[130px] px-2 py-1.5 sm:max-w-none sm:px-3 sm:py-2">
                <span className="block truncate font-medium text-fg sm:inline sm:max-w-none sm:overflow-visible sm:whitespace-normal sm:text-clip">
                  {s.stop_name ?? s.stop_id}
                </span>
                {s.stop_name && (
                  <span className="hidden text-xs text-fg-subtle sm:ml-1 sm:inline">#{s.stop_id}</span>
                )}
              </td>
              <td
                className={cn(
                  "px-2 py-1.5 text-right font-mono font-semibold sm:px-3 sm:py-2",
                  s.avg_delay_seconds > 300 ? "text-danger" : "text-fg-muted",
                )}
              >
                {formatDelayMin(s.avg_delay_seconds)}
              </td>
              <td className="px-2 py-1.5 text-right font-mono sm:px-3 sm:py-2" style={{ color: onTimeColor(s.on_time_pct, resolvedTheme) }}>
                {s.on_time_pct.toFixed(0)}%
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-fg-subtle sm:px-3 sm:py-2">
                {formatNumber(s.observations)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

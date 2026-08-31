"use client";
import { useMemo, useState } from "react";
import type { OnTimeRouteStats } from "@/lib/types";
import { cn, formatDelayMin, formatNumber, onTimeColor } from "@/lib/utils";

const PAGE_SIZE = 10;

interface Props {
  routes: OnTimeRouteStats[];
  onSelectRoute?: (routeId: string) => void;
}

type SortKey = "route" | "on_time_pct" | "avg_delay_seconds" | "total_observations";

export default function ScorecardTable({ routes, onSelectRoute }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("on_time_pct");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const copy = [...routes];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "route") {
        cmp = a.route_short_name.localeCompare(b.route_short_name, undefined, { numeric: true });
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [routes, sortKey, asc]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function toggle(key: SortKey) {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === "route");
    }
    setPage(0);
  }

  if (!routes.length) {
    return <p className="py-6 text-center text-sm text-fg-muted">No route data yet.</p>;
  }

  const Header = ({ k, label, align = "right" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <th
      className={cn(
        "cursor-pointer select-none px-3 py-2 text-xs uppercase text-fg-muted hover:text-fg",
        align === "right" ? "text-right" : "text-left",
      )}
      onClick={() => toggle(k)}
    >
      {label} {sortKey === k ? (asc ? "▲" : "▼") : ""}
    </th>
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-line">
        <table className="min-w-full text-sm text-fg">
          <thead className="bg-card-muted">
            <tr>
              <Header k="route" label="Route" align="left" />
              <Header k="on_time_pct" label="On-time" />
              <Header k="avg_delay_seconds" label="Avg delay" />
              <Header k="total_observations" label="Samples" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pageRows.map((r) => (
              <tr
                key={r.route_id}
                className={cn("hover:bg-card-muted", onSelectRoute && "cursor-pointer")}
                onClick={() => onSelectRoute?.(r.route_id)}
              >
                <td className="px-3 py-2 font-bold text-fg">{r.route_short_name}</td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex items-center gap-2 justify-end">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: onTimeColor(r.on_time_pct) }}
                    />
                    <span className="font-mono font-semibold" style={{ color: onTimeColor(r.on_time_pct) }}>
                      {r.on_time_pct.toFixed(1)}%
                    </span>
                  </span>
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono",
                    r.avg_delay_seconds > 300 ? "text-danger" : "text-fg-muted",
                  )}
                >
                  {formatDelayMin(r.avg_delay_seconds)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-fg-subtle">
                  {formatNumber(r.total_observations)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-xs text-fg-muted">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE + PAGE_SIZE, sorted.length)} of{" "}
            {sorted.length}
          </span>
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
            className="px-2 py-0.5 rounded hover:bg-card-muted disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ‹
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
            className="px-2 py-0.5 rounded hover:bg-card-muted disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

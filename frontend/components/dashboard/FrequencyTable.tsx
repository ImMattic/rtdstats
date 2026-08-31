"use client";
import { memo, useMemo, useState } from "react";
import type { FrequencyRouteStats } from "@/lib/types";
import { headwayColor } from "@/lib/utils";

type SortKey = keyof Pick<
  FrequencyRouteStats,
  "route_short_name" | "vehicle_count" | "avg_headway_minutes" | "min_headway_minutes"
>;
type SortDir = "asc" | "desc";

const PAGE_SIZE = 15;

interface Props {
  routes: FrequencyRouteStats[];
  onRowClick?: (routeId: string) => void;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-block ${active ? "text-fg" : "text-fg-subtle"}`}>
      {active && dir === "desc" ? "▼" : "▲"}
    </span>
  );
}

function FrequencyBadge({ minutes }: { minutes: number }) {
  const color = headwayColor(minutes);
  const label =
    minutes <= 0
      ? "—"
      : minutes <= 15
        ? "High"
        : minutes <= 30
          ? "Moderate"
          : "Low";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

function FrequencyTable({ routes, onRowClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("avg_headway_minutes");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const copy = routes.filter((r) => r.avg_headway_minutes > 0);
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [routes, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  if (!routes.length) {
    return <p className="text-sm text-fg-muted py-4">No frequency data yet.</p>;
  }

  const thClass = "px-3 py-2 cursor-pointer select-none whitespace-nowrap hover:text-fg";

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-line">
        <table className="min-w-full text-sm text-fg">
          <thead className="bg-card-muted text-xs uppercase text-fg-muted">
            <tr>
              <th
                className={`${thClass} text-left`}
                onClick={() => handleSort("route_short_name")}
              >
                Route
                <SortIcon active={sortKey === "route_short_name"} dir={sortDir} />
              </th>
              <th
                className={`${thClass} text-right`}
                onClick={() => handleSort("vehicle_count")}
              >
                Vehicles
                <SortIcon active={sortKey === "vehicle_count"} dir={sortDir} />
              </th>
              <th
                className={`${thClass} text-right`}
                onClick={() => handleSort("avg_headway_minutes")}
              >
                Avg headway
                <span className="ml-1 font-normal normal-case opacity-50">(est.)</span>
                <SortIcon active={sortKey === "avg_headway_minutes"} dir={sortDir} />
              </th>
              <th
                className={`${thClass} text-right`}
                onClick={() => handleSort("min_headway_minutes")}
              >
                Range (30 min)
                <SortIcon active={sortKey === "min_headway_minutes"} dir={sortDir} />
              </th>
              <th className="px-3 py-2 text-center">Frequency</th>
              <th className="w-6"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pageRows.map((r) => (
              <tr
                key={r.route_id}
                className={`group hover:bg-card-muted ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={() => onRowClick?.(r.route_id)}
              >
                <td className="px-3 py-2 font-bold text-fg">{r.route_short_name}</td>
                <td className="px-3 py-2 text-right">{r.vehicle_count}</td>
                <td className="px-3 py-2 text-right">
                  {r.avg_headway_minutes > 0 ? `${r.avg_headway_minutes} min` : "—"}
                </td>
                <td className="px-3 py-2 text-right text-fg-muted">
                  {r.min_headway_minutes > 0 && r.min_headway_minutes !== r.max_headway_minutes
                    ? `${r.min_headway_minutes}–${r.max_headway_minutes} min`
                    : r.avg_headway_minutes > 0
                      ? `~${r.avg_headway_minutes} min`
                      : "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  <FrequencyBadge minutes={r.avg_headway_minutes} />
                </td>
                <td className="pr-3 text-fg-subtle group-hover:text-fg-muted transition-colors select-none">›</td>
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

export default memo(FrequencyTable);

"use client";
import { memo, useMemo, useState } from "react";
import type { FrequencyRouteStats } from "@/lib/types";
import { headwayColor } from "@/lib/utils";

type SortKey = keyof Pick<
  FrequencyRouteStats,
  "route_short_name" | "vehicle_count" | "avg_headway_minutes" | "min_headway_minutes"
>;
type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [15, 30, 50, 100] as const;

interface Props {
  routes: FrequencyRouteStats[];
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-block ${active ? "text-gray-700" : "text-gray-300"}`}>
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

function FrequencyTable({ routes }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("avg_headway_minutes");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(15);

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

  const totalPages = Math.ceil(sorted.length / pageSize);
  const pageRows = sorted.slice(page * pageSize, page * pageSize + pageSize);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function handlePageSize(size: (typeof PAGE_SIZE_OPTIONS)[number]) {
    setPageSize(size);
    setPage(0);
  }

  if (!routes.length) {
    return <p className="text-sm text-gray-500 py-4">No frequency data yet.</p>;
  }

  const thClass = "px-3 py-2 cursor-pointer select-none whitespace-nowrap hover:text-gray-700";

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm text-gray-800">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pageRows.map((r) => (
              <tr key={r.route_id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-bold text-gray-900">{r.route_short_name}</td>
                <td className="px-3 py-2 text-right">{r.vehicle_count}</td>
                <td className="px-3 py-2 text-right">
                  {r.avg_headway_minutes > 0 ? `${r.avg_headway_minutes} min` : "—"}
                </td>
                <td className="px-3 py-2 text-right text-gray-500">
                  {r.min_headway_minutes > 0 && r.min_headway_minutes !== r.max_headway_minutes
                    ? `${r.min_headway_minutes}–${r.max_headway_minutes} min`
                    : r.avg_headway_minutes > 0
                      ? `~${r.avg_headway_minutes} min`
                      : "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  <FrequencyBadge minutes={r.avg_headway_minutes} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              onClick={() => handlePageSize(size)}
              className={`px-2 py-0.5 rounded ${
                pageSize === size
                  ? "bg-gray-200 text-gray-800 font-semibold"
                  : "hover:bg-gray-100"
              }`}
            >
              {size}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span>
            {page * pageSize + 1}–{Math.min(page * pageSize + pageSize, sorted.length)} of{" "}
            {sorted.length}
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
      </div>
    </div>
  );
}

export default memo(FrequencyTable);

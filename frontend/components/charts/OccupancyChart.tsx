"use client";
import { memo, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import type { OccupancyResponse } from "@/lib/types";
import { formatHour } from "@/lib/utils";

interface Props {
  data: OccupancyResponse;
  direction?: number;
  onDirectionChange?: (dir: number | undefined) => void;
}

const CODES = [
  { key: "empty",        label: "Empty",              color: "#16a34a" },
  { key: "many_seats",   label: "Many seats",         color: "#4ade80" },
  { key: "few_seats",    label: "Few seats",          color: "#f59e0b" },
  { key: "standing",     label: "Standing room",      color: "#f97316" },
  { key: "crushed",      label: "Crushed standing",   color: "#dc2626" },
  { key: "full",         label: "Full",               color: "#991b1b" },
  { key: "not_accepting",label: "Not accepting",      color: "#4b5563" },
] as const;

type CodeKey = typeof CODES[number]["key"];

function OccupancyChart({ data, direction, onDirectionChange }: Props) {
  const hourData = useMemo(() => {
    return data.by_hour
      .filter((h) => {
        const known = h.empty + h.many_seats + h.few_seats + h.standing + h.crushed + h.full + h.not_accepting;
        return known > 0;
      })
      .map((h) => {
        const known = h.empty + h.many_seats + h.few_seats + h.standing + h.crushed + h.full + h.not_accepting;
        const pct = (n: number) => known > 0 ? parseFloat(((100 * n) / known).toFixed(1)) : 0;
        return {
          label: formatHour(h.hour),
          empty: pct(h.empty),
          many_seats: pct(h.many_seats),
          few_seats: pct(h.few_seats),
          standing: pct(h.standing),
          crushed: pct(h.crushed),
          full: pct(h.full),
          not_accepting: pct(h.not_accepting),
        };
      });
  }, [data.by_hour]);

  if (!data.reported) {
    return (
      <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
        RTD is not currently publishing occupancy codes in its GTFS-RT feed for this selection,
        so live crowding can&apos;t be shown.
      </div>
    );
  }

  const total = data.empty + data.many_seats + data.few_seats + data.standing + data.crushed + data.full + data.not_accepting;
  const pct = (n: number) => total > 0 ? `${((100 * n) / total).toFixed(0)}%` : "0%";

  const hasDirections = data.directions && data.directions.length > 1;

  return (
    <div>
      {/* Direction toggle buttons */}
      {hasDirections && onDirectionChange && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-gray-500">Direction:</span>
          <button
            onClick={() => onDirectionChange(undefined)}
            className={`rounded px-2 py-1 font-medium transition-colors ${
              direction === undefined
                ? "bg-rtd-blue text-white"
                : "border border-gray-200 text-gray-600 hover:border-rtd-blue"
            }`}
          >
            All
          </button>
          {data.directions.map((d) => (
            <button
              key={d.direction_id}
              onClick={() => onDirectionChange(d.direction_id === direction ? undefined : d.direction_id)}
              className={`rounded px-2 py-1 font-medium transition-colors ${
                direction === d.direction_id
                  ? "bg-rtd-blue text-white"
                  : "border border-gray-200 text-gray-600 hover:border-rtd-blue"
              }`}
            >
              {d.headsign || `Direction ${d.direction_id}`}
            </button>
          ))}
        </div>
      )}

      {/* Summary pills */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {CODES.filter((c) => {
          const v = data[c.key as CodeKey];
          return typeof v === "number" && v > 0;
        }).map((c) => {
          const v = data[c.key as CodeKey] as number;
          return (
            <span
              key={c.key}
              className="rounded px-2 py-1"
              style={{ backgroundColor: `${c.color}1a`, color: c.color }}
            >
              {c.label} {pct(v)}
            </span>
          );
        })}
        <span className="ml-auto text-gray-400">{total.toLocaleString()} samples</span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={hourData} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} interval={1} />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: "#4b5563" }}
            width={36}
            domain={[0, 100]}
          />
          <Tooltip
            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {CODES.map((c, i) => (
            <Bar
              key={c.key}
              dataKey={c.key}
              name={c.label}
              stackId="a"
              fill={c.color}
              radius={i === CODES.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(OccupancyChart);

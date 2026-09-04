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
import { useChartTheme } from "@/lib/useChartTheme";

interface Props {
  data: OccupancyResponse;
  direction?: number;
  onDirectionChange?: (dir: number | undefined) => void;
}

const CODE_DEFS = [
  { key: "empty",         label: "Empty" },
  { key: "many_seats",    label: "Many seats" },
  { key: "few_seats",     label: "Few seats" },
  { key: "standing",      label: "Standing room" },
  { key: "crushed",       label: "Crushed standing" },
  { key: "full",          label: "Full" },
  { key: "not_accepting", label: "Not accepting" },
] as const;

type CodeKey = typeof CODE_DEFS[number]["key"];

const COLORS: Record<"dark" | "light", Record<CodeKey, string>> = {
  light: {
    empty: "#16a34a",
    many_seats: "#4ade80",
    few_seats: "#f59e0b",
    standing: "#f97316",
    crushed: "#dc2626",
    full: "#991b1b",
    not_accepting: "#4b5563",
  },
  dark: {
    empty: "#16a34a",
    many_seats: "#4ade80",
    few_seats: "#f59e0b",
    standing: "#f97316",
    crushed: "#EC3A35",
    full: "#D4554D",
    not_accepting: "#7C838E",
  },
};

function OccupancyChart({ data, direction, onDirectionChange }: Props) {
  const theme = useChartTheme();
  const colors = COLORS[theme.mode];
  const CODES = CODE_DEFS.map((c) => ({ ...c, color: colors[c.key] }));

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
      <div className="status-warn rounded-lg p-4 text-sm">
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
          <span className="text-fg-subtle">Direction:</span>
          <button
            onClick={() => onDirectionChange(undefined)}
            className={`rounded px-2 py-1 font-medium transition-colors ${
              direction === undefined
                ? "bg-accent text-accent-ink"
                : "border border-line text-fg-muted hover:border-accent"
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
                  ? "bg-accent text-accent-ink"
                  : "border border-line text-fg-muted hover:border-accent"
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
        <span className="ml-auto text-fg-subtle">{total.toLocaleString()} samples</span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={hourData} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: theme.axis }} interval={1} />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: theme.text }}
            width={36}
            domain={[0, 100]}
          />
          <Tooltip
            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
            cursor={{ fill: theme.cursorFill, stroke: "transparent" }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              background: theme.tooltipBg,
              border: `1px solid ${theme.tooltipBorder}`,
              color: theme.tooltipText,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: theme.text }} />
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

"use client";
import { memo, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { TrendPoint } from "@/lib/types";

interface Props {
  points: TrendPoint[];
  granularity: string;
  onPointClick?: (point: TrendPoint) => void;
}

function fmtTick(t: string, granularity: string): string {
  const d = new Date(t);
  if (granularity === "hour") {
    return d.toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TrendChart({ points, granularity, onPointClick }: Props) {
  const data = useMemo(
    () => points.map((p) => ({ ...p, label: fmtTick(p.t, granularity) })),
    [points, granularity],
  );

  if (!points.length) {
    return <p className="py-8 text-center text-sm text-gray-500">No trend data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart
        data={data}
        margin={{ left: 4, right: 8, top: 8 }}
        style={onPointClick ? { cursor: "pointer" } : undefined}
        onClick={
          onPointClick
            ? (chartData) => {
                const pt = chartData?.activePayload?.[0]?.payload as TrendPoint | undefined;
                if (pt) onPointClick(pt);
              }
            : undefined
        }
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={24} />
        <YAxis
          yAxisId="pct"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: "#4b5563" }}
          width={40}
        />
        <YAxis
          yAxisId="delay"
          orientation="right"
          tickFormatter={(v) => `${Math.round(v / 60)}m`}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          width={40}
        />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === "On-time %"
              ? [`${value.toFixed(1)}%`, name]
              : [`${(value / 60).toFixed(1)} min`, name]
          }
          labelClassName="text-xs"
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <ReferenceLine yAxisId="pct" y={80} stroke="#94a3b8" strokeDasharray="4 2" />
        <Area
          yAxisId="delay"
          type="monotone"
          dataKey="avg_delay_seconds"
          name="Avg delay"
          stroke="#cbd5e1"
          fill="#f1f5f9"
          strokeWidth={1}
        />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="on_time_pct"
          name="On-time %"
          stroke="#002F87"
          strokeWidth={2.5}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default memo(TrendChart);

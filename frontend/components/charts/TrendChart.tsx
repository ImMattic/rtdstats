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
import { useChartTheme } from "@/lib/useChartTheme";

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

function TrendTooltip({ active, payload, label, clickable }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  clickable: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 shadow-card" style={{ fontSize: 12 }}>
      <p className="mb-1 text-xs font-semibold text-fg">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color ?? "currentColor" }} className="text-xs text-fg-muted">
          {entry.name}:{" "}
          {entry.name === "On-time %"
            ? `${Number(entry.value).toFixed(1)}%`
            : `${(Number(entry.value) / 60).toFixed(1)} min`}
        </p>
      ))}
      {clickable && (
        <p className="mt-1.5 border-t border-line pt-1 text-xs font-medium text-accent">
          Click to see vehicles →
        </p>
      )}
    </div>
  );
}

function TrendChart({ points, granularity, onPointClick }: Props) {
  const theme = useChartTheme();
  const data = useMemo(
    () => points.map((p) => ({ ...p, label: fmtTick(p.t, granularity) })),
    [points, granularity],
  );

  if (!points.length) {
    return <p className="py-8 text-center text-sm text-fg-muted">No trend data yet.</p>;
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
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: theme.axis }} minTickGap={24} />
        <YAxis
          yAxisId="pct"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: theme.text }}
          width={40}
        />
        <YAxis
          yAxisId="delay"
          orientation="right"
          tickFormatter={(v) => `${Math.round(v / 60)}m`}
          tick={{ fontSize: 11, fill: theme.axis }}
          width={40}
        />
        <Tooltip
          content={({ active, payload, label }) => (
            <TrendTooltip
              active={active}
              label={label}
              payload={payload?.map((p) => ({ name: String(p.name ?? ""), value: Number(p.value ?? 0), color: p.color }))}
              clickable={!!onPointClick}
            />
          )}
        />
        <ReferenceLine yAxisId="pct" y={80} stroke={theme.reference} strokeDasharray="4 2" />
        <Area
          yAxisId="delay"
          type="monotone"
          dataKey="avg_delay_seconds"
          name="Avg delay"
          stroke={theme.grid}
          fill={theme.seriesFaint}
          strokeWidth={1}
        />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="on_time_pct"
          name="On-time %"
          stroke={theme.series}
          strokeWidth={2.5}
          dot={{ r: 3, fill: theme.series, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: theme.series, stroke: theme.tooltipBg, strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default memo(TrendChart);

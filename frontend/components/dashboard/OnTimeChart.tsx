"use client";
import { memo, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { OnTimeRouteStats } from "@/lib/types";
import { onTimeColor } from "@/lib/utils";
import { useChartTheme } from "@/lib/useChartTheme";

interface Props {
  routes: OnTimeRouteStats[];
}

function OnTimeChart({ routes }: Props) {
  const theme = useChartTheme();

  // Sort by on_time_pct descending, top 20; recompute only when routes change.
  const data = useMemo(
    () => [...routes].sort((a, b) => b.on_time_pct - a.on_time_pct).slice(0, 20),
    [routes],
  );

  if (!routes.length) {
    return <p className="text-sm text-fg-subtle py-4">No on-time data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: theme.axis }}
        />
        <YAxis
          type="category"
          dataKey="route_short_name"
          width={36}
          tick={{ fontSize: 11, fill: theme.text }}
        />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(1)}%`, "On time"]}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            background: theme.tooltipBg,
            border: `1px solid ${theme.tooltipBorder}`,
            color: theme.tooltipText,
          }}
          cursor={{ fill: theme.mode === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)" }}
        />
        <ReferenceLine x={80} stroke={theme.reference} strokeDasharray="4 2" />
        <Bar dataKey="on_time_pct" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={onTimeColor(entry.on_time_pct, theme.mode)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(OnTimeChart);

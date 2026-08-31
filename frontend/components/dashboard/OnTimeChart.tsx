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
    return <p className="py-4 text-sm text-fg-muted">No on-time data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: theme.text }}
        />
        <YAxis
          type="category"
          dataKey="route_short_name"
          width={36}
          tick={{ fontSize: 11, fill: theme.text }}
        />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(1)}%`, "On time"]}
          cursor={{ fill: theme.grid, opacity: 0.4 }}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            background: theme.tooltipBg,
            border: `1px solid ${theme.tooltipBorder}`,
            color: theme.tooltipText,
          }}
          labelStyle={{ color: theme.tooltipText }}
          itemStyle={{ color: theme.tooltipText }}
        />
        <ReferenceLine x={80} stroke={theme.reference} strokeDasharray="4 2" />
        <Bar dataKey="on_time_pct" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={
                entry.on_time_pct >= 80
                  ? "#16a34a"
                  : entry.on_time_pct >= 60
                    ? "#84cc16"
                    : entry.on_time_pct >= 40
                      ? "#eab308"
                      : entry.on_time_pct >= 20
                        ? "#f97316"
                        : "#dc2626"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(OnTimeChart);

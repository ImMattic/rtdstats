"use client";
import { memo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import type { DistributionBin } from "@/lib/types";
import { useChartTheme } from "@/lib/useChartTheme";

interface Props {
  bins: DistributionBin[];
}

// Diverging palette: early (cool) → on-time (ok/teal) → late (warm/red).
// Position + label already carry the bin identity — color is reinforcement.
const BIN_COLORS: Record<"dark" | "light", Record<string, string>> = {
  light: {
    very_early: "#0ea5e9",
    early: "#38bdf8",
    on_time: "#16a34a",
    slightly_late: "#f59e0b",
    late: "#ea580c",
    very_late: "#dc2626",
  },
  dark: {
    very_early: "#0ea5e9",
    early: "#38bdf8",
    on_time: "#16a34a",
    slightly_late: "#f59e0b",
    late: "#ea580c",
    very_late: "#EC3A35",
  },
};

function DistributionChart({ bins }: Props) {
  const theme = useChartTheme();
  const colors = BIN_COLORS[theme.mode];

  if (!bins.length || bins.every((b) => b.count === 0)) {
    return <p className="py-8 text-center text-sm text-fg-subtle">No delay data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={bins} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: theme.axis }}
          interval={0}
          angle={-12}
          textAnchor="end"
          height={48}
        />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: theme.text }} width={36} />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(1)}%`, "Share of arrivals"]}
          cursor={{ fill: theme.cursorFill, stroke: "transparent" }}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            background: theme.tooltipBg,
            border: `1px solid ${theme.tooltipBorder}`,
            color: theme.tooltipText,
          }}
          itemStyle={{ color: theme.tooltipText }}
        />
        <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
          {bins.map((b) => (
            <Cell key={b.key} fill={colors[b.key] ?? theme.axis} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(DistributionChart);

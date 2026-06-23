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

interface Props {
  bins: DistributionBin[];
}

// Diverging palette: early (cool) → on-time (green) → late (warm/red).
const BIN_COLORS: Record<string, string> = {
  very_early: "#0ea5e9",
  early: "#38bdf8",
  on_time: "#16a34a",
  slightly_late: "#f59e0b",
  late: "#ea580c",
  very_late: "#dc2626",
};

function DistributionChart({ bins }: Props) {
  if (!bins.length || bins.every((b) => b.count === 0)) {
    return <p className="py-8 text-center text-sm text-gray-500">No delay data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={bins} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: "#64748b" }}
          interval={0}
          angle={-12}
          textAnchor="end"
          height={48}
        />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#4b5563" }} width={36} />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(1)}%`, "Share of arrivals"]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
          {bins.map((b) => (
            <Cell key={b.key} fill={BIN_COLORS[b.key] ?? "#94a3b8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(DistributionChart);

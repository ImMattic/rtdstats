"use client";
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

interface Props {
  routes: OnTimeRouteStats[];
}

export default function OnTimeChart({ routes }: Props) {
  if (!routes.length) {
    return <p className="text-sm text-gray-500 py-4">No on-time data yet.</p>;
  }

  // Sort by on_time_pct descending
  const data = [...routes]
    .sort((a, b) => b.on_time_pct - a.on_time_pct)
    .slice(0, 20); // cap for readability

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: "#4b5563" }}
        />
        <YAxis
          type="category"
          dataKey="route_short_name"
          width={36}
          tick={{ fontSize: 11, fill: "#1f2937" }}
        />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(1)}%`, "On time"]}
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
        />
        <ReferenceLine x={80} stroke="#6b7280" strokeDasharray="4 2" />
        <Bar dataKey="on_time_pct" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={
                entry.on_time_pct >= 80
                  ? "#16a34a"
                  : entry.on_time_pct >= 60
                    ? "#ea580c"
                    : "#dc2626"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

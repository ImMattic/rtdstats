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
  CartesianGrid,
} from "recharts";
import type { HourHeadway } from "@/lib/types";
import { formatHour, headwayColor } from "@/lib/utils";

interface Props {
  headways: HourHeadway[];
}

/** Scheduled headway (minutes between buses/trains) by hour of day. */
function HeadwayChart({ headways }: Props) {
  const data = useMemo(
    () =>
      headways
        .filter((h) => h.headway_minutes !== null)
        .map((h) => ({ hour: h.hour, label: formatHour(h.hour), headway: h.headway_minutes as number })),
    [headways],
  );

  if (!data.length) {
    return <p className="py-8 text-center text-sm text-gray-500">No scheduled-frequency data for this route.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} interval={1} />
        <YAxis
          tickFormatter={(v) => `${v}m`}
          tick={{ fontSize: 11, fill: "#4b5563" }}
          width={36}
          reversed
        />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(0)} min`, "Headway"]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey="headway" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.hour} fill={headwayColor(d.headway)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(HeadwayChart);

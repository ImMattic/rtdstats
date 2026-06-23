"use client";
import { memo, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { RidershipResponse } from "@/lib/types";
import { formatCompact, formatMonth, formatNumber } from "@/lib/utils";

interface Props {
  data: RidershipResponse;
}

function RidershipChart({ data }: Props) {
  const series = useMemo(
    () => data.series.map((p) => ({ ...p, label: formatMonth(p.month) })),
    [data.series],
  );
  const topRoutes = useMemo(() => data.by_route_latest.slice(0, 8), [data.by_route_latest]);

  if (!data.available) {
    return (
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
        No ridership data imported yet. Drop an RTD/NTD monthly CSV into{" "}
        <code className="rounded bg-blue-100 px-1">gtfs-static/ridership/</code> and run{" "}
        <code className="rounded bg-blue-100 px-1">python -m scripts.import_ridership</code>.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-medium text-gray-500">
          Monthly boardings{data.route_id ? "" : " (system total)"}
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={20} />
            <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: "#4b5563" }} width={44} />
            <Tooltip
              formatter={(value: number) => [formatNumber(value), "Boardings"]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="boardings" fill="#bfdbfe" radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="boardings" stroke="#002F87" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {!data.route_id && (
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">
            Top routes — {data.latest_month ? formatMonth(data.latest_month) : "latest month"}
          </p>
          <div className="space-y-1.5">
            {topRoutes.map((r) => {
              const max = topRoutes[0]?.boardings || 1;
              return (
                <div key={r.route_id} className="flex items-center gap-2 text-xs">
                  <span className="w-10 shrink-0 text-right font-bold text-gray-900">
                    {r.route_short_name}
                  </span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-gray-100">
                    <div
                      className="h-full rounded bg-rtd-blue"
                      style={{ width: `${(100 * r.boardings) / max}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-gray-600">
                    {formatCompact(r.boardings)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(RidershipChart);

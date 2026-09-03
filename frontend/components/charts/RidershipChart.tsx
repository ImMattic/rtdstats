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
import { useChartTheme } from "@/lib/useChartTheme";

interface Props {
  data: RidershipResponse;
}

function RidershipChart({ data }: Props) {
  const theme = useChartTheme();
  const series = useMemo(
    () => data.series.map((p) => ({ ...p, label: formatMonth(p.month) })),
    [data.series],
  );
  const topRoutes = useMemo(() => data.by_route_latest.slice(0, 8), [data.by_route_latest]);

  if (!data.available) {
    return (
      <div className="status-info rounded-lg p-4 text-sm">
        No ridership data imported yet. Drop an RTD/NTD monthly CSV into{" "}
        <code className="rounded bg-accent/15 px-1">gtfs-static/ridership/</code> and run{" "}
        <code className="rounded bg-accent/15 px-1">python -m scripts.import_ridership</code>.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-medium text-fg-subtle">
          Monthly boardings{data.route_id ? "" : " (system total)"}
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: theme.axis }} minTickGap={20} />
            <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: theme.text }} width={44} />
            <Tooltip
              formatter={(value: number) => [formatNumber(value), "Boardings"]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                background: theme.tooltipBg,
                border: `1px solid ${theme.tooltipBorder}`,
                color: theme.tooltipText,
              }}
            />
            <Bar dataKey="boardings" fill={theme.accent} fillOpacity={0.35} radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="boardings" stroke={theme.accent} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {!data.route_id && (
        <div>
          <p className="mb-2 text-xs font-medium text-fg-subtle">
            Top routes — {data.latest_month ? formatMonth(data.latest_month) : "latest month"}
          </p>
          <div className="space-y-1.5">
            {topRoutes.map((r) => {
              const max = topRoutes[0]?.boardings || 1;
              return (
                <div key={r.route_id} className="flex items-center gap-2 text-xs">
                  <span className="w-10 shrink-0 text-right font-bold text-fg">
                    {r.route_short_name}
                  </span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-raised">
                    <div
                      className="h-full rounded bg-accent"
                      style={{ width: `${(100 * r.boardings) / max}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-fg-muted">
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

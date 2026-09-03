"use client";
import { useMemo } from "react";
import type { ServiceDeliveryResponse } from "@/lib/types";
import { cn, deliveredColor, formatNumber } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";

interface Props {
  data: ServiceDeliveryResponse;
  limit?: number;
}

/** Horizontal "trips operated vs scheduled" bars — the budget headline metric. */
export default function ServiceDeliveryChart({ data, limit = 20 }: Props) {
  const { resolvedTheme } = useTheme();
  const routes = useMemo(
    () => data.routes.filter((r) => r.scheduled_trips > 0).slice(0, limit),
    [data.routes, limit],
  );

  if (!routes.length) {
    return (
      <p className="py-8 text-center text-sm text-fg-subtle">
        No service-delivery data yet (needs both observed trips and a scheduled baseline).
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {routes.map((r) => {
        const color = deliveredColor(r.delivered_pct, resolvedTheme);
        return (
          <div key={r.route_id} className="flex items-center gap-2 text-xs">
            <span className="w-10 shrink-0 text-right font-bold text-fg">{r.route_short_name}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-raised">
              <div
                className="h-full rounded transition-all"
                style={{ width: `${Math.min(100, r.delivered_pct)}%`, backgroundColor: color }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-semibold text-white mix-blend-difference">
                {formatNumber(r.observed_trips)} / {formatNumber(r.scheduled_trips)} trips
              </span>
            </div>
            <span className={cn("w-12 shrink-0 text-right font-mono font-semibold")} style={{ color }}>
              {r.delivered_pct.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

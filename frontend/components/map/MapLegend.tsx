"use client";

import { useMemo } from "react";
import { cn, headwayColor } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";

/**
 * Headway colour key for the live map, pinned to the bottom-left corner. The
 * four buckets and their colours are the ones `headwayColor` paints on the
 * vehicle markers — keep them in step. Labels stay to a single boundary
 * number so the strip reads at a glance. `className` lets the caller hide it on
 * narrow screens while a dialog occupies the same corner.
 */
export default function MapLegend({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();

  const items = useMemo(
    () =>
      [
        { label: "<15", sample: 10 },
        { label: "≥15", sample: 20 },
        { label: "≥30", sample: 45 },
        { label: "≥60", sample: 90 },
      ].map((it) => ({ ...it, color: headwayColor(it.sample, resolvedTheme) })),
    [resolvedTheme],
  );

  return (
    <div className={cn("pointer-events-none absolute bottom-3 left-3 z-[1000]", className)}>
      <div className="flex items-center gap-2 rounded-full border border-line bg-card/90 px-3 py-1.5 text-[11px] text-fg-muted shadow-lg shadow-black/30 backdrop-blur-md">
        <span className="font-medium text-fg-subtle">Headway&nbsp;(min)</span>
        {items.map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1 whitespace-nowrap">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

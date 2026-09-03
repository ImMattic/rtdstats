"use client";
import { useMemo, useState } from "react";
import type { HeatmapCell } from "@/lib/types";
import { DOW_LABELS, delayColor, formatHour, onTimeColor } from "@/lib/utils";
import { useChartTheme } from "@/lib/useChartTheme";

interface Props {
  cells: HeatmapCell[];
  /** "ontime" colors by on-time %, "delay" by average delay. */
  metric?: "ontime" | "delay";
  onCellClick?: (cell: HeatmapCell) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DOWS = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun for display

const LEGEND: Record<"dark" | "light", { ontime: string[]; delay: string[] }> = {
  light: {
    ontime: ["#dc2626", "#f97316", "#eab308", "#c8d614", "#16a34a"],
    delay: ["#16a34a", "#eab308", "#dc2626"],
  },
  dark: {
    ontime: ["#EC3A35", "#f97316", "#eab308", "#c8d614", "#16a34a"],
    delay: ["#16a34a", "#eab308", "#EC3A35"],
  },
};

export default function Heatmap({ cells, metric = "ontime", onCellClick }: Props) {
  const theme = useChartTheme();
  const [hover, setHover] = useState<HeatmapCell | null>(null);

  const lookup = useMemo(() => {
    const m = new Map<string, HeatmapCell>();
    for (const c of cells) m.set(`${c.dow}-${c.hour}`, c);
    return m;
  }, [cells]);

  if (!cells.length) {
    return <p className="py-8 text-center text-sm text-fg-subtle">No heatmap data yet.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Hour axis */}
          <div className="flex pl-10">
            {HOURS.map((h) => (
              <div key={h} className="w-[18px] text-center text-[8px] text-fg-subtle">
                {h % 3 === 0 ? formatHour(h) : ""}
              </div>
            ))}
          </div>
          {DOWS.map((dow) => (
            <div key={dow} className="flex items-center">
              <div className="w-10 pr-1 text-right text-[10px] font-medium text-fg-muted">
                {DOW_LABELS[dow]}
              </div>
              {HOURS.map((h) => {
                const cell = lookup.get(`${dow}-${h}`);
                const color = !cell
                  ? theme.grid
                  : metric === "ontime"
                    ? onTimeColor(cell.on_time_pct, theme.mode)
                    : delayColor(cell.avg_delay_seconds, theme.mode);
                return (
                  <div
                    key={h}
                    className={`m-[1px] h-[18px] w-[16px] rounded-sm transition-transform hover:scale-125 ${cell && onCellClick ? "cursor-pointer" : ""}`}
                    style={{ backgroundColor: color, opacity: cell ? 1 : 0.4 }}
                    onMouseEnter={() => cell && setHover(cell)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => cell && onCellClick?.(cell)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-fg-subtle">
        <div className="h-4">
          {hover && (
            <span>
              <span className="font-semibold text-fg-muted">
                {DOW_LABELS[hover.dow]} {formatHour(hover.hour)}
              </span>{" "}
              · {hover.on_time_pct.toFixed(0)}% on-time · {(hover.avg_delay_seconds / 60).toFixed(1)}m avg ·{" "}
              {hover.observations.toLocaleString()} samples
              {onCellClick && (
                <span className="ml-2 font-medium text-accent">· Click to view trips →</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span>{metric === "ontime" ? "worse" : "early"}</span>
          {LEGEND[theme.mode][metric === "ontime" ? "ontime" : "delay"].map((c) => (
            <span key={c} className="h-3 w-3 rounded-sm" style={{ backgroundColor: c }} />
          ))}
          <span>{metric === "ontime" ? "better" : "late"}</span>
        </div>
      </div>
    </div>
  );
}

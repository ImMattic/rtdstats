import CountUp from "@/components/ui/CountUp";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  /** Pre-formatted fallback value (used when `numericValue` is not supplied). */
  value?: string;
  /** When finite, the value counts up to this on mount and on change. */
  numericValue?: number;
  /** Formats `numericValue` for display. */
  format?: (n: number) => string;
  subtitle?: string;
  /** Signed change vs. the previous period (already in display units). */
  delta?: number | null;
  deltaSuffix?: string;
  /** When true, a negative delta is good (e.g. delay, headway). */
  lowerIsBetter?: boolean;
  accentColor?: string;
}

function deltaTone(delta: number, lowerIsBetter: boolean): "good" | "bad" | "flat" {
  if (Math.abs(delta) < 0.05) return "flat";
  const improving = lowerIsBetter ? delta < 0 : delta > 0;
  return improving ? "good" : "bad";
}

export default function KpiCard({
  title,
  value = "—",
  numericValue,
  format = (n) => String(Math.round(n)),
  subtitle,
  delta,
  deltaSuffix = "",
  lowerIsBetter = false,
  accentColor,
}: Props) {
  const showDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const tone = showDelta ? deltaTone(delta as number, lowerIsBetter) : "flat";
  const toneClass =
    tone === "good" ? "text-ok" : tone === "bad" ? "text-danger" : "text-fg-subtle";
  const arrow = !showDelta ? "" : (delta as number) > 0 ? "▲" : (delta as number) < 0 ? "▼" : "—";

  const showCount = typeof numericValue === "number" && Number.isFinite(numericValue);
  const accent = accentColor ?? "rgb(var(--accent))";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 shadow-card">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: accent }}
      />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
        {title}
      </p>
      <p
        className="mt-1.5 font-display text-3xl font-bold tabular-nums text-fg"
        style={accentColor ? { color: accentColor } : undefined}
      >
        {showCount ? (
          <CountUp value={numericValue as number} format={format} />
        ) : (
          value
        )}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {showDelta && (
          <span className={cn("text-xs font-semibold", toneClass)}>
            {arrow} {Math.abs(delta as number).toFixed(1)}
            {deltaSuffix}
          </span>
        )}
        {subtitle && <span className="text-xs text-fg-subtle">{subtitle}</span>}
      </div>
    </div>
  );
}

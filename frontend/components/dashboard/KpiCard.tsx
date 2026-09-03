import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  value: string;
  subtitle?: string;
  /** Signed change vs. the previous period (already computed in display units). */
  delta?: number | null;
  /** Suffix shown after the delta number, e.g. "pts" or "s". */
  deltaSuffix?: string;
  /** When true, a negative delta is good (e.g. delay, headway). Default: up is good. */
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
  value,
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

  return (
    <Card className="flex flex-col justify-between">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{title}</p>
      <p
        className="mt-1 text-3xl font-bold text-fg"
        style={accentColor ? { color: accentColor } : undefined}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {showDelta && (
          <span className={cn("text-xs font-semibold", toneClass)}>
            {arrow} {Math.abs(delta as number).toFixed(1)}
            {deltaSuffix}
          </span>
        )}
        {subtitle && <span className="text-xs text-fg-subtle">{subtitle}</span>}
      </div>
    </Card>
  );
}

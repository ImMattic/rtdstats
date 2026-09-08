import { cn, type TripStatus } from "@/lib/utils";

const STATUS_COLOR: Record<TripStatus, string> = {
  in_progress: "#F6871F", // RTD orange
  complete: "#009483", // teal
  incomplete: "#CE0E2D", // RTD red
};

const STATUS_LABEL: Record<TripStatus, string> = {
  in_progress: "In Progress",
  complete: "Complete",
  incomplete: "Incomplete",
};

interface TripStatusBadgeProps {
  status: TripStatus;
  /** "tag" (default): a labeled pill for the trip detail header.
   *  "dot": a compact colour-coded circle for dense table rows. */
  variant?: "tag" | "dot";
  size?: "sm" | "md";
  className?: string;
}

/**
 * Trip status indicator, shared between the trips table (as a "dot") and the
 * individual trip page (as a "tag"): orange + blinking while still live,
 * teal once finished, red if it dropped off the schedule before its
 * terminus. See `computeTripStatus` in lib/utils for how callers decide.
 */
export default function TripStatusBadge({
  status,
  variant = "tag",
  size = "md",
  className,
}: TripStatusBadgeProps) {
  const color = STATUS_COLOR[status];
  const label = STATUS_LABEL[status];
  const blinking = status === "in_progress";

  if (variant === "dot") {
    const dotSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full", dotSize, className)}
        style={{ backgroundColor: color }}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full bg-white", blinking && "animate-pulse")} />
      </span>
    );
  }

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wide text-white",
        sizeClasses,
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {blinking && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white" />}
      {label}
    </span>
  );
}

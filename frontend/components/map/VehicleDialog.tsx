import { formatDelay, formatDateTime } from "@/lib/utils";
import type { VehiclePosition } from "@/lib/types";

interface Props {
  vehicle: VehiclePosition;
  onClose: () => void;
  isStuck?: boolean;
}

const STATUS_LABELS: Record<number, string> = {
  0: "Arriving at",
  1: "Stopped at",
  2: "In transit to",
};

export default function VehicleDialog({ vehicle: v, onClose, isStuck = false }: Props) {
  const delay = v.delay_seconds ?? 0;
  const isLate = delay > 300;
  const isEarly = delay < -300;
  const delayText = (isLate || isEarly) ? formatDelay(v.delay_seconds) : "";

  const badgeClass = isStuck || isEarly ? "status-warn" : isLate ? "status-danger" : "status-ok";
  const badgeText = isStuck ? "Stuck" : isLate ? "Late" : isEarly ? "Early" : "On time";

  return (
    <div className="animate-dialog-in absolute bottom-6 left-1/2 z-[9999] w-80 -translate-x-1/2 overflow-hidden rounded-2xl bg-card/95 shadow-card ring-1 ring-line backdrop-blur-md">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ backgroundColor: `#${v.route_color || "003DA5"}` }}
      >
        <div>
          <span className="text-lg font-bold">{v.route_short_name}</span>
          {v.vehicle_label && (
            <span className="ml-2 text-sm opacity-80">#{v.vehicle_label}</span>
          )}
          <p className="mt-0.5 text-xs opacity-70">{v.route_long_name}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="press rounded-full p-1 hover:bg-white/20"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="space-y-2 px-4 py-3 text-sm text-fg">
        {/* Current stop */}
        <div className="flex items-start gap-2">
          <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-accent" />
          <div>
            <p className="text-xs text-fg-muted">
              {STATUS_LABELS[v.current_status ?? -1] ?? "At"}
            </p>
            <p className="font-medium text-fg">{v.stop_name ?? v.stop_id ?? "Unknown stop"}</p>
          </div>
        </div>

        {/* On-time status */}
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
            {badgeText}
          </span>
          {delayText && <span className="font-mono text-fg-muted">{delayText}</span>}
        </div>

        {/* Headway */}
        {v.headway_minutes !== null && (
          <p className="text-xs text-fg-muted">
            Real-time headway:{" "}
            <span className="font-medium text-fg">{v.headway_minutes} min</span>
          </p>
        )}

        {/* Occupancy */}
        {v.occupancy_status && v.occupancy_status !== "UNKNOWN" && (
          <p className="text-xs text-fg-muted">
            Occupancy:{" "}
            <span className="font-medium text-fg">
              {v.occupancy_status.replace(/_/g, " ")}
            </span>
          </p>
        )}

        {/* Last updated */}
        <p className="text-xs text-fg-subtle">Updated {formatDateTime(v.timestamp)}</p>

        {/* Links */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-1.5">
          <a
            href={`https://app.rtd-denver.com/route/${v.route_short_name}/schedule`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            RTD schedule
            <svg className="h-3 w-3 opacity-70" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd"/>
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd"/>
            </svg>
          </a>
          <a
            href={
              v.route_type !== "3"
                ? `https://www.greaterdenvertransit.com/rtd-${v.route_short_name.toLowerCase()}line/`
                : `https://www.greaterdenvertransit.com/rtd-route${v.route_short_name}/`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            GDT overview
            <svg className="h-3 w-3 opacity-70" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd"/>
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

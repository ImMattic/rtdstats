import { formatDelay, formatTime, formatDateTime, routeColor } from "@/lib/utils";
import type { VehiclePosition } from "@/lib/types";

interface Props {
  vehicle: VehiclePosition;
  onClose: () => void;
}

const STATUS_LABELS: Record<number, string> = {
  0: "Arriving at",
  1: "Stopped at",
  2: "In transit to",
};

export default function VehicleDialog({ vehicle: v, onClose }: Props) {
  const delayText = formatDelay(v.delay_seconds);
  const isLate = (v.delay_seconds ?? 0) > 300;
  const isEarly = (v.delay_seconds ?? 0) < -60;

  return (
    <div className="animate-dialog-in absolute bottom-6 left-1/2 z-[9999] w-80 -translate-x-1/2 rounded-xl bg-white/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between rounded-t-xl px-4 py-3 text-white"
        style={{ backgroundColor: `#${v.route_color || "003DA5"}` }}
      >
        <div>
          <span className="text-lg font-bold">{v.route_short_name}</span>
          {v.vehicle_label && (
            <span className="ml-2 text-sm opacity-80">#{v.vehicle_label}</span>
          )}
          <p className="text-xs opacity-70 mt-0.5">{v.route_long_name}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 hover:bg-white/20 transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2 text-sm text-gray-900">
        {/* Current stop */}
        <div className="flex items-start gap-2">
          <span className="mt-0.5 h-2 w-2 rounded-full bg-rtd-blue flex-shrink-0" />
          <div>
            <p className="text-gray-900 text-xs">
              {STATUS_LABELS[v.current_status ?? -1] ?? "At"}
            </p>
            <p className="font-medium text-gray-900">{v.stop_name ?? v.stop_id ?? "Unknown stop"}</p>
          </div>
        </div>

        {/* On-time status */}
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              isLate
                ? "bg-red-100 text-red-700"
                : isEarly
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-green-100 text-green-700"
            }`}
          >
            {isLate ? "Late" : isEarly ? "Early" : "On time"}
          </span>
          <span className="font-mono text-gray-700">{delayText}</span>
        </div>

        {/* Headway */}
        {v.headway_minutes !== null && (
          <p className="text-gray-500 text-xs">
            Real-time headway:{" "}
            <span className="font-medium text-gray-800">
              {v.headway_minutes} min
            </span>
          </p>
        )}

        {/* Occupancy */}
        {v.occupancy_status && v.occupancy_status !== "UNKNOWN" && (
          <p className="text-gray-500 text-xs">
            Occupancy:{" "}
            <span className="font-medium text-gray-800">
              {v.occupancy_status.replace(/_/g, " ")}
            </span>
          </p>
        )}

        {/* Last updated */}
        <p className="text-gray-400 text-xs">
          Updated {formatDateTime(v.timestamp)}
        </p>

        {/* RTD schedule link */}
        <div className="pt-1.5 border-t border-gray-100">
          <a
            href={`https://app.rtd-denver.com/route/${v.route_short_name}/schedule`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-rtd-blue hover:underline"
          >
            View RTD schedule
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

import type { StopInfo, VehiclePosition } from "@/lib/types";

interface Props {
  stop: StopInfo;
  vehicles: VehiclePosition[];
  onClose: () => void;
}

const RAIL_TYPES = new Set(["0", "1", "2"]);

const STATUS_LABELS: Record<number, string> = {
  0: "Arriving",
  1: "Stopped",
  2: "En route",
};

function ExternalLinkIcon() {
  return (
    <svg className="h-3 w-3 opacity-70" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
      <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
    </svg>
  );
}

export default function StopDialog({ stop, vehicles, onClose }: Props) {
  const liveVehicles = vehicles.filter((v) => v.stop_id === stop.stop_id);

  const railRoutes = stop.routes.filter((r) => RAIL_TYPES.has(r.route_type));
  const busRoutes = stop.routes.filter((r) => !RAIL_TYPES.has(r.route_type));
  const sortedRoutes = [...railRoutes, ...busRoutes];

  return (
    <div className="animate-dialog-in absolute bottom-6 left-1/2 z-[9999] w-80 -translate-x-1/2 rounded-xl bg-white/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-start justify-between rounded-t-xl bg-gray-900 px-4 py-3 text-white">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold leading-tight">{stop.stop_name}</h2>
          {stop.stop_desc && (
            <p className="text-xs text-gray-400 mt-0.5">{stop.stop_desc}</p>
          )}
          <p className="text-xs text-gray-500 mt-0.5">Stop #{stop.stop_id}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-2 mt-0.5 shrink-0 rounded-full p-1 hover:bg-white/20 transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3 text-sm text-gray-900">
        {/* Line badges */}
        {sortedRoutes.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Lines serving this stop</p>
            <div className="flex flex-wrap gap-1.5">
              {sortedRoutes.map((r) => (
                <span
                  key={r.route_id}
                  title={r.long_name}
                  className="inline-flex items-center rounded px-2 py-0.5 text-xs font-bold text-white leading-tight"
                  style={{ backgroundColor: `#${r.color || "888888"}` }}
                >
                  {r.short_name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Live vehicles at this stop */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Live vehicles</p>
          {liveVehicles.length > 0 ? (
            <div className="space-y-1.5">
              {liveVehicles.map((v, i) => {
                const delay = v.delay_seconds ?? 0;
                const delayLabel =
                  delay > 60
                    ? `+${Math.round(delay / 60)}m late`
                    : delay < -60
                      ? `${Math.round(delay / 60)}m early`
                      : "On time";
                const delayColor =
                  delay > 300 ? "text-red-600" : delay < -60 ? "text-yellow-600" : "text-green-600";

                return (
                  <div key={v.vehicle_id ?? v.trip_id ?? i} className="flex items-center gap-2">
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: `#${v.route_color || "888888"}` }}
                    >
                      {v.route_short_name}
                    </span>
                    <span className="text-xs text-gray-600 truncate">
                      {STATUS_LABELS[v.current_status ?? -1] ?? "Nearby"}
                      {v.vehicle_label ? ` · #${v.vehicle_label}` : ""}
                    </span>
                    <span className={`ml-auto shrink-0 text-xs font-medium ${delayColor}`}>
                      {delayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No vehicles currently detected at this stop.</p>
          )}
        </div>

        {/* Links */}
        <div className="pt-1.5 border-t border-gray-100 flex flex-wrap gap-x-3 gap-y-1">
          <a
            href={`https://app.rtd-denver.com/nextride/stop/${stop.stop_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-rtd-blue hover:underline"
          >
            RTD NextRide
            <ExternalLinkIcon />
          </a>
        </div>
      </div>
    </div>
  );
}

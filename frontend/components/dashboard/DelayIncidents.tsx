import type { StuckAlert } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface Props {
  alerts: StuckAlert[];
}

export default function DelayIncidents({ alerts }: Props) {
  if (!alerts.length) {
    return (
      <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
        No stuck vehicles detected.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => (
        <li key={i} className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-red-800">{a.route_short_name}</span>
              {a.vehicle_label && (
                <span className="ml-2 text-sm text-red-700">#{a.vehicle_label}</span>
              )}
              {a.stop_name && (
                <span className="ml-2 text-sm text-red-600">@ {a.stop_name}</span>
              )}
            </div>
            <span className="rounded-full bg-red-200 px-2 py-0.5 text-xs font-semibold text-red-800">
              {a.minutes_stuck} min
            </span>
          </div>
          <p className="mt-1 text-xs text-red-500">
            Stuck since {formatDateTime(a.stuck_since)}
          </p>
        </li>
      ))}
    </ul>
  );
}

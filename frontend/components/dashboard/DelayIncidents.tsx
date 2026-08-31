import Link from "next/link";
import type { StuckAlert } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface Props {
  alerts: StuckAlert[];
}

function mapHref(a: StuckAlert): string | null {
  if (a.latitude === null || a.longitude === null) return null;
  const params = new URLSearchParams({
    lat: String(a.latitude),
    lng: String(a.longitude),
  });
  if (a.vehicle_id) params.set("vehicle_id", a.vehicle_id);
  return `/?${params.toString()}`;
}

export default function DelayIncidents({ alerts }: Props) {
  if (!alerts.length) {
    return (
      <p className="status-ok rounded-lg px-4 py-3 text-sm">
        No stuck vehicles detected.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => {
        const href = mapHref(a);
        return (
          <li key={i} className="status-danger rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold">{a.route_short_name}</span>
                {a.vehicle_label && (
                  <span className="ml-2 text-sm opacity-90">#{a.vehicle_label}</span>
                )}
                {a.stop_name && (
                  <span className="ml-2 text-sm opacity-80">@ {a.stop_name}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="min-w-[4.5rem] rounded-full bg-danger/20 px-2 py-0.5 text-center text-xs font-semibold tabular-nums">
                  {a.minutes_stuck} min
                </span>
                {href && (
                  <Link
                    href={href}
                    title="See on Map"
                    className="press flex-shrink-0 opacity-70 transition-opacity hover:opacity-100"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs opacity-75">
              Stuck since {formatDateTime(a.stuck_since)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

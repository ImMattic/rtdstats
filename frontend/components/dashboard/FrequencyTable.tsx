import type { FrequencyRouteStats } from "@/lib/types";
import { headwayColor } from "@/lib/utils";

interface Props {
  routes: FrequencyRouteStats[];
}

function FrequencyBadge({ minutes }: { minutes: number }) {
  const color = headwayColor(minutes);
  const label =
    minutes <= 0
      ? "—"
      : minutes <= 15
        ? "High"
        : minutes <= 30
          ? "Moderate"
          : "Low";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

export default function FrequencyTable({ routes }: Props) {
  if (!routes.length) {
    return <p className="text-sm text-gray-500 py-4">No frequency data yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="min-w-full text-sm text-gray-800">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">Route</th>
            <th className="px-3 py-2 text-right">Vehicles</th>
            <th className="px-3 py-2 text-right">
                Avg headway
                <span className="ml-1 font-normal normal-case opacity-50">(est.)</span>
              </th>
            <th className="px-3 py-2 text-right">Range (30 min)</th>
            <th className="px-3 py-2 text-center">Frequency</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {[...routes]
            .sort((a, b) => a.avg_headway_minutes - b.avg_headway_minutes)
            .map((r) => (
              <tr key={r.route_id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-bold text-gray-900">{r.route_short_name}</td>
                <td className="px-3 py-2 text-right">{r.vehicle_count}</td>
                <td className="px-3 py-2 text-right">
                  {r.avg_headway_minutes > 0 ? `${r.avg_headway_minutes} min` : "—"}
                </td>
                <td className="px-3 py-2 text-right text-gray-500">
                  {r.min_headway_minutes > 0 && r.min_headway_minutes !== r.max_headway_minutes
                    ? `${r.min_headway_minutes}–${r.max_headway_minutes} min`
                    : r.avg_headway_minutes > 0 ? `~${r.avg_headway_minutes} min` : "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  <FrequencyBadge minutes={r.avg_headway_minutes} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

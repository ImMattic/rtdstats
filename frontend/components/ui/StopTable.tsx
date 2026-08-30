import { formatDelay, formatTime } from "@/lib/utils";

interface StopRow {
  stop_id: string | null;
  stop_name?: string | null;
  stop_sequence: number | null;
  arrival_time?: string | null;
  delay_seconds?: number | null;
}

interface Props {
  stops: StopRow[];
  className?: string;
}

export default function StopTable({ stops, className }: Props) {
  if (!stops.length) {
    return <p className="text-sm text-gray-500">No stop data available.</p>;
  }

  return (
    <div className={`overflow-x-auto rounded border border-gray-200 ${className ?? ""}`}>
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Stop</th>
            <th className="px-3 py-2 text-right">Sched.</th>
            <th className="px-3 py-2 text-right">Delay</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {stops.map((s, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-400">{s.stop_sequence ?? i + 1}</td>
              <td className="px-3 py-2 font-medium">{s.stop_name ?? s.stop_id ?? "—"}</td>
              <td className="px-3 py-2 text-right text-gray-500">
                {s.arrival_time ? formatTime(s.arrival_time) : "—"}
              </td>
              <td
                className={`px-3 py-2 text-right font-mono ${
                  (s.delay_seconds ?? 0) > 300
                    ? "text-red-600"
                    : (s.delay_seconds ?? 0) < -300
                      ? "text-yellow-600"
                      : "text-green-700"
                }`}
              >
                {formatDelay(s.delay_seconds ?? null)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

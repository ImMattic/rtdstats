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
    return <p className="text-sm text-fg-muted">No stop data available.</p>;
  }

  return (
    <div className={`overflow-x-auto rounded border border-line ${className ?? ""}`}>
      <table className="min-w-full text-sm">
        <thead className="bg-card-muted text-xs uppercase text-fg-muted">
          <tr>
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Stop</th>
            <th className="px-3 py-2 text-right">Sched.</th>
            <th className="px-3 py-2 text-right">Delay</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {stops.map((s, i) => (
            <tr key={i} className="hover:bg-card-muted">
              <td className="px-3 py-2 text-fg-subtle">{s.stop_sequence ?? i + 1}</td>
              <td className="px-3 py-2 font-medium">{s.stop_name ?? s.stop_id ?? "—"}</td>
              <td className="px-3 py-2 text-right text-fg-muted">
                {s.arrival_time ? formatTime(s.arrival_time) : "—"}
              </td>
              <td
                className={`px-3 py-2 text-right font-mono ${
                  (s.delay_seconds ?? 0) > 300
                    ? "text-danger"
                    : (s.delay_seconds ?? 0) < -300
                      ? "text-warn"
                      : "text-ok"
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

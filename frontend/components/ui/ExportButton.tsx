"use client";
import { exportUrl } from "@/lib/api";

interface Props {
  routeId?: string;
  start?: string;
  end?: string;
}

export default function ExportButton({ routeId, start, end }: Props) {
  const handleExport = (format: "csv" | "json") => {
    const url = exportUrl({ format, route_id: routeId, start, end, limit: 10_000 });
    const a = document.createElement("a");
    a.href = url;
    a.download = `vehicle_positions.${format}`;
    a.click();
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleExport("csv")}
        className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90 transition-opacity"
      >
        Export CSV
      </button>
      <button
        onClick={() => handleExport("json")}
        className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90 transition-opacity"
      >
        Export JSON
      </button>
    </div>
  );
}

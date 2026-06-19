import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Convert a hex color string (with or without #) to a CSS color. */
export function routeColor(hex: string): string {
  const clean = hex.startsWith("#") ? hex : `#${hex}`;
  return clean === "#" || clean === "#888888" ? "#6b7280" : clean;
}

/** Frequency headway → border color for vehicle markers. */
export function headwayColor(headwayMinutes: number | null): string {
  if (headwayMinutes === null || headwayMinutes === 0) return "#6b7280"; // unknown – gray
  if (headwayMinutes < 15)  return "#1B7A3D"; // <15 min – green
  if (headwayMinutes <= 20) return "#7CB342"; // ≤20 min – yellow-green
  if (headwayMinutes <= 30) return "#F2C12E"; // ≤30 min – yellow
  if (headwayMinutes <= 40) return "#EF8C28"; // ≤40 min – orange
  if (headwayMinutes <= 50) return "#D9512E"; // ≤50 min – orange-red
  return "#8C1D18";                           // 60+ min – deep red
}

/** Format seconds as "+Xm Ys" / "On time" / "-Xm Ys". */
export function formatDelay(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds === 0) return "On time";
  const sign = seconds > 0 ? "+" : "-";
  const abs = Math.abs(seconds);
  const mins = Math.floor(abs / 60);
  const secs = abs % 60;
  return mins > 0 ? `${sign}${mins}m ${secs}s` : `${sign}${secs}s`;
}

/** ISO timestamp → human-friendly local string. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

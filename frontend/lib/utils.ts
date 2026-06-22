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

/** Format seconds as "+Xm Ys" / "" / "-Xm Ys". Returns "" for exactly 0 (badge already says "On time"). */
export function formatDelay(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds === 0) return "";
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

/** Color for an on-time percentage across five tiers. */
export function onTimeColor(pct: number): string {
  if (pct >= 80) return "#16a34a"; // green
  if (pct >= 60) return "#84cc16"; // yellow-green
  if (pct >= 40) return "#eab308"; // yellow
  if (pct >= 20) return "#f97316"; // orange
  return "#dc2626";                // red
}

/** Compact integer with thousands separators (e.g. 12,345). */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US");
}

/** Large numbers as short form: 1.2M, 34.5K. */
export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Delay seconds → short signed minutes string, e.g. "+5.2m", "-1.0m", "on time". */
export function formatDelayMin(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const mins = seconds / 60;
  if (Math.abs(mins) < 0.1) return "on time";
  return `${mins > 0 ? "+" : ""}${mins.toFixed(1)}m`;
}

/** ISO date (YYYY-MM-DD) → "May 2026". */
export function formatMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Format hour 0–23 as "1 PM", "12 AM". */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

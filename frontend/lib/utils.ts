import { clsx, type ClassValue } from "clsx";
import type { ResolvedTheme } from "@/lib/useTheme";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Convert a hex color string (with or without #) to a CSS color. */
export function routeColor(hex: string): string {
  const clean = hex.startsWith("#") ? hex : `#${hex}`;
  return clean === "#" || clean === "#888888" ? "#6b7280" : clean;
}

/**
 * White or near-black — whichever reads better as text on top of `hex`.
 * Used for badges/pills whose background is a data-driven color (headway,
 * route brand color) rather than a theme token, so a fixed text color can't
 * be relied on to stay legible.
 */
export function bestTextOn(hex: string): string {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (clean.length !== 6) return "#FFFFFF";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Contrast against white vs. against near-black — pick whichever is higher.
  const contrastWhite = 1.05 / (luminance + 0.05);
  const contrastDark = (luminance + 0.05) / 0.05;
  return contrastWhite >= contrastDark ? "#FFFFFF" : "#0D0E11";
}

/**
 * Frequency headway → marker/badge color, re-stepped per theme so the ramp
 * clears contrast against both the dark ("Last Train") and light ("First
 * Train") chart surfaces. Pair with `bestTextOn` for any fixed-text badge.
 */
export function headwayColor(headwayMinutes: number | null, mode: ResolvedTheme = "dark"): string {
  if (mode === "light") {
    if (headwayMinutes === null || headwayMinutes === 0) return "#6b7280";
    if (headwayMinutes < 15) return "#1B7A3D";
    if (headwayMinutes <= 20) return "#7CB342";
    if (headwayMinutes <= 30) return "#F2C12E";
    if (headwayMinutes <= 40) return "#EF8C28";
    if (headwayMinutes <= 50) return "#D9512E";
    return "#991B1B";
  }
  if (headwayMinutes === null || headwayMinutes === 0) return "#7C838E"; // unknown – gray
  if (headwayMinutes < 15) return "#368F51";  // <15 min – green
  if (headwayMinutes <= 20) return "#7CB342"; // ≤20 min – yellow-green
  if (headwayMinutes <= 30) return "#F2C12E"; // ≤30 min – yellow
  if (headwayMinutes <= 40) return "#EF8C28"; // ≤40 min – orange
  if (headwayMinutes <= 50) return "#DA522F"; // ≤50 min – orange-red
  return "#CD5B4F";                           // 60+ min – deep red
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

/** Color for an on-time percentage across five tiers, re-stepped per theme. */
export function onTimeColor(pct: number, mode: ResolvedTheme = "dark"): string {
  if (mode === "light") {
    if (pct >= 80) return "#16a34a";
    if (pct >= 65) return "#c8d614";
    if (pct >= 50) return "#eab308";
    if (pct >= 35) return "#f97316";
    return "#dc2626";
  }
  if (pct >= 80) return "#16a34a"; // green — already bright enough for dark
  if (pct >= 65) return "#c8d614"; // chartreuse
  if (pct >= 50) return "#eab308"; // yellow
  if (pct >= 35) return "#f97316"; // orange
  return "#EC3A35";                // red, lightened to clear the dark card
}

/** Color for an average delay in seconds — early/on-time (cool) → very late (warm/red). */
export function delayColor(seconds: number, mode: ResolvedTheme = "dark"): string {
  if (mode === "light") {
    if (seconds <= 0) return "#16a34a";
    if (seconds <= 300) return "#65a30d";
    if (seconds <= 600) return "#eab308";
    if (seconds <= 900) return "#ea580c";
    return "#dc2626";
  }
  if (seconds <= 0) return "#16a34a";
  if (seconds <= 300) return "#65a30d";
  if (seconds <= 600) return "#eab308";
  if (seconds <= 900) return "#ea580c";
  return "#EC3A35";
}

/** Service-delivered-vs-scheduled percentage → bar color, re-stepped per theme. */
export function deliveredColor(pct: number, mode: ResolvedTheme = "dark"): string {
  if (mode === "light") {
    if (pct >= 95) return "#16a34a";
    if (pct >= 85) return "#65a30d";
    if (pct >= 70) return "#ea580c";
    return "#dc2626";
  }
  if (pct >= 95) return "#16a34a";
  if (pct >= 85) return "#65a30d";
  if (pct >= 70) return "#ea580c";
  return "#EC3A35";
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

/** GTFS-realtime status/occupancy key (e.g. "IN_TRANSIT_TO") → "In transit to". */
export function formatStatusLabel(key: string | null | undefined): string {
  if (!key) return "";
  const words = key.toLowerCase().split("_");
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? ` ${words.slice(1).join(" ")}` : "");
}

/** Compass bearing (deg, 0=N) from point A→B. Returns null if the points coincide. */
function bearingBetween(lat1: number, lon1: number, lat2: number, lon2: number): number | null {
  if (lat1 === lat2 && lon1 === lon2) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

interface TrackSample {
  latitude: number;
  longitude: number;
  bearing: number | null;
  timestamp: string;
}

/**
 * Find where the vehicle was at `targetIso` by linearly interpolating between the
 * two bracketing position samples. Bearing comes from the direction of travel
 * across that segment (falling back to a reported bearing when the vehicle is
 * stationary). Clamps to the first/last sample when the target falls outside the
 * recorded track. Returns null when no usable samples exist.
 */
export function interpolateTrackPosition(
  positions: TrackSample[],
  targetIso: string,
): { lat: number; lon: number; bearing: number | null } | null {
  const samples = positions
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => ({ ...p, t: new Date(p.timestamp).getTime() }))
    .sort((a, b) => a.t - b.t);
  if (samples.length === 0) return null;

  const target = new Date(targetIso).getTime();
  const first = samples[0];
  const last = samples[samples.length - 1];

  if (target <= first.t) return { lat: first.latitude, lon: first.longitude, bearing: first.bearing };
  if (target >= last.t) return { lat: last.latitude, lon: last.longitude, bearing: last.bearing };

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (target >= a.t && target <= b.t) {
      const frac = b.t === a.t ? 0 : (target - a.t) / (b.t - a.t);
      const lat = a.latitude + (b.latitude - a.latitude) * frac;
      const lon = a.longitude + (b.longitude - a.longitude) * frac;
      const bearing =
        bearingBetween(a.latitude, a.longitude, b.latitude, b.longitude) ?? a.bearing ?? b.bearing;
      return { lat, lon, bearing };
    }
  }
  return null;
}

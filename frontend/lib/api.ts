import type {
  AlertsResponse,
  DistributionResponse,
  FrequencyResponse,
  HeatmapResponse,
  HistoricalResponse,
  OccupancyResponse,
  OnTimeResponse,
  OverviewResponse,
  RidershipResponse,
  RouteShape,
  RouteStopsResponse,
  RailShapesResponse,
  RealtimeResponse,
  RoutesResponse,
  ScheduleFrequencyResponse,
  ServiceDeliveryResponse,
  TrendResponse,
  WorstStopsResponse,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Realtime ───────────────────────────────────────────────────────────────

export function fetchVehicles(): Promise<RealtimeResponse> {
  return apiFetch("/api/v1/realtime/vehicles");
}

export function fetchVehiclesByRoute(routeId: string): Promise<RealtimeResponse> {
  return apiFetch(`/api/v1/realtime/vehicles/${encodeURIComponent(routeId)}`);
}

// ── Routes ─────────────────────────────────────────────────────────────────

export function fetchRoutes(): Promise<RoutesResponse> {
  return apiFetch("/api/v1/routes");
}

export function fetchRailShapes(): Promise<RailShapesResponse> {
  return apiFetch("/api/v1/routes/shapes");
}

export function fetchRouteShape(routeId: string): Promise<RouteShape> {
  return apiFetch(`/api/v1/routes/shape/${encodeURIComponent(routeId)}`);
}

export function fetchRouteStops(routeId: string): Promise<RouteStopsResponse> {
  return apiFetch(`/api/v1/routes/stops/${encodeURIComponent(routeId)}`);
}

// ── Historical ────────────────────────────────────────────────────────────

export interface HistoricalParams {
  route_id?: string;
  start?: string;
  end?: string;
  limit?: number;
  page?: number;
}

export function fetchHistorical(params: HistoricalParams = {}): Promise<HistoricalResponse> {
  const qs = new URLSearchParams();
  if (params.route_id) qs.set("route_id", params.route_id);
  if (params.start) qs.set("start", params.start);
  if (params.end) qs.set("end", params.end);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.page) qs.set("page", String(params.page));
  const query = qs.toString() ? `?${qs}` : "";
  return apiFetch(`/api/v1/historical/vehicles${query}`);
}

// ── Stats ──────────────────────────────────────────────────────────────────

export function fetchOnTime(days = 7, routeId?: string): Promise<OnTimeResponse> {
  const qs = new URLSearchParams({ days: String(days) });
  if (routeId) qs.set("route_id", routeId);
  return apiFetch(`/api/v1/stats/ontime?${qs}`);
}

export function fetchFrequency(routeId?: string): Promise<FrequencyResponse> {
  const qs = new URLSearchParams();
  if (routeId) qs.set("route_id", routeId);
  const query = qs.toString() ? `?${qs}` : "";
  return apiFetch(`/api/v1/stats/frequency${query}`);
}

export function fetchAlerts(): Promise<AlertsResponse> {
  return apiFetch("/api/v1/stats/alerts");
}

// ── Analytics ────────────────────────────────────────────────────────────────

function withParams(base: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}

export function fetchOverview(days = 7, routeId?: string): Promise<OverviewResponse> {
  return apiFetch(withParams("/api/v1/stats/overview", { days, route_id: routeId }));
}

export function fetchOnTimeTrend(
  days = 14,
  routeId?: string,
  granularity: "hour" | "day" = "day",
): Promise<TrendResponse> {
  return apiFetch(withParams("/api/v1/stats/ontime/trend", { days, route_id: routeId, granularity }));
}

export function fetchHeatmap(days = 30, routeId?: string): Promise<HeatmapResponse> {
  return apiFetch(withParams("/api/v1/stats/ontime/heatmap", { days, route_id: routeId }));
}

export function fetchDistribution(days = 7, routeId?: string): Promise<DistributionResponse> {
  return apiFetch(withParams("/api/v1/stats/delay/distribution", { days, route_id: routeId }));
}

export function fetchWorstStops(days = 14, routeId?: string, limit = 15): Promise<WorstStopsResponse> {
  return apiFetch(withParams("/api/v1/stats/stops/worst", { days, route_id: routeId, limit }));
}

export function fetchServiceDelivery(days = 7, routeId?: string): Promise<ServiceDeliveryResponse> {
  return apiFetch(withParams("/api/v1/stats/service-delivery", { days, route_id: routeId }));
}

export function fetchScheduleFrequency(routeId?: string): Promise<ScheduleFrequencyResponse> {
  return apiFetch(withParams("/api/v1/stats/frequency/schedule", { route_id: routeId }));
}

export function fetchOccupancy(days = 7, routeId?: string, direction?: number): Promise<OccupancyResponse> {
  return apiFetch(withParams("/api/v1/stats/occupancy", { days, route_id: routeId, direction }));
}

export function fetchRidership(routeId?: string, months = 24): Promise<RidershipResponse> {
  return apiFetch(withParams("/api/v1/stats/ridership", { route_id: routeId, months }));
}

// ── Export ─────────────────────────────────────────────────────────────────

export function exportUrl(params: {
  format: "csv" | "json";
  route_id?: string;
  start?: string;
  end?: string;
  limit?: number;
}): string {
  const qs = new URLSearchParams({ format: params.format });
  if (params.route_id) qs.set("route_id", params.route_id);
  if (params.start) qs.set("start", params.start);
  if (params.end) qs.set("end", params.end);
  if (params.limit) qs.set("limit", String(params.limit));
  return `${BASE}/api/v1/export/vehicles?${qs}`;
}

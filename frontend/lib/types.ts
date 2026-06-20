// ── Shared domain types mirroring the backend Pydantic schemas ──────────────

export interface RailShape {
  route_id: string;
  short_name: string;
  color: string;         // hex string e.g. "#008348"
  shapes: [number, number][][];  // array of polylines, each is [[lat,lon],...]
}

export interface RailShapesResponse {
  shapes: RailShape[];
}

export interface RouteShape {
  route_id: string;
  short_name: string;
  route_type: string;
  color: string;
  shapes: [number, number][][];
}

export interface RouteInfo {
  route_id: string;
  short_name: string;
  long_name: string;
  route_type: string;
  type_name: "light_rail" | "heavy_rail" | "commuter_rail" | "bus" | "other";
  color: string;
  agency_id: string;
}

export interface VehiclePosition {
  vehicle_id: string | null;
  vehicle_label: string | null;
  trip_id: string | null;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_color: string;
  route_type: string;
  latitude: number | null;
  longitude: number | null;
  bearing: number | null;
  current_stop_sequence: number | null;
  current_status: number | null;
  current_status_label: string | null;
  stop_id: string | null;
  stop_name: string | null;
  occupancy_status: string | null;
  timestamp: string;
  delay_seconds: number | null;
  is_late: boolean | null;
  headway_minutes: number | null;
}

export interface RealtimeResponse {
  updated_at: string;
  vehicles: VehiclePosition[];
  route_headways: Record<string, number>;
}

export interface VehicleHistoryPoint {
  vehicle_id: string | null;
  vehicle_label: string | null;
  trip_id: string | null;
  route_id: string;
  route_short_name: string | null;
  latitude: number | null;
  longitude: number | null;
  bearing: number | null;
  current_status: number | null;
  stop_id: string | null;
  occupancy_status: string | null;
  timestamp: string;
  delay_seconds: number | null;
}

export interface HistoricalResponse {
  start: string;
  end: string;
  page?: number;
  limit?: number;
  returned: number;
  total?: number;
  total_pages?: number;
  vehicles: VehicleHistoryPoint[];
}

export interface OnTimeRouteStats {
  route_id: string;
  route_short_name: string;
  total_observations: number;
  on_time: number;
  late: number;
  early: number;
  on_time_pct: number;
  avg_delay_seconds: number;
}

export interface OnTimeResponse {
  period_days: number;
  routes: OnTimeRouteStats[];
  overall: { on_time_pct: number; avg_delay_seconds: number };
}

export interface FrequencyRouteStats {
  route_id: string;
  route_short_name: string;
  avg_headway_minutes: number;
  min_headway_minutes: number;
  max_headway_minutes: number;
  vehicle_count: number;
}

export interface FrequencyResponse {
  computed_at: string;
  routes: FrequencyRouteStats[];
}

export interface StuckAlert {
  vehicle_id: string | null;
  vehicle_label: string | null;
  route_id: string;
  route_short_name: string;
  latitude: number | null;
  longitude: number | null;
  stop_id: string | null;
  stop_name: string | null;
  stuck_since: string;
  minutes_stuck: number;
}

export interface AlertsResponse {
  computed_at: string;
  alerts: StuckAlert[];
}

export interface RoutesResponse {
  routes: RouteInfo[];
}

export interface RouteStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
}

export interface RouteStopsResponse {
  route_id: string;
  stops: RouteStop[];
}

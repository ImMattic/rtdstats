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

// ── Deep analytics (api/v1/stats/* analytics endpoints) ─────────────────────

export interface MetricWithDelta {
  value: number;
  previous: number | null;
}

export interface OverviewResponse {
  period_days: number;
  on_time_pct: MetricWithDelta;
  avg_delay_seconds: MetricWithDelta;
  delay_stddev_seconds: number;
  service_delivered_pct: MetricWithDelta;
  observed_trips: number;
  scheduled_trips: number;
  routes_tracked: number;
  total_observations: number;
  latest_ridership_month: string | null;
  latest_ridership_total: number | null;
  prev_ridership_total: number | null;
}

export interface TrendPoint {
  t: string;
  on_time_pct: number;
  avg_delay_seconds: number;
  observations: number;
}

export interface TrendResponse {
  period_days: number;
  granularity: string;
  route_id: string | null;
  points: TrendPoint[];
}

export interface HeatmapCell {
  dow: number; // 0=Sun … 6=Sat (local)
  hour: number; // 0–23 (local)
  on_time_pct: number;
  avg_delay_seconds: number;
  observations: number;
}

export interface HeatmapResponse {
  period_days: number;
  route_id: string | null;
  cells: HeatmapCell[];
}

export interface DistributionBin {
  key: string;
  label: string;
  count: number;
  pct: number;
}

export interface DistributionResponse {
  period_days: number;
  route_id: string | null;
  total: number;
  avg_delay_seconds: number;
  stddev_seconds: number;
  bins: DistributionBin[];
}

export interface WorstStop {
  stop_id: string;
  stop_name: string | null;
  route_id: string | null;
  observations: number;
  on_time_pct: number;
  avg_delay_seconds: number;
}

export interface WorstStopsResponse {
  period_days: number;
  route_id: string | null;
  stops: WorstStop[];
}

export interface ServiceDeliveryRoute {
  route_id: string;
  route_short_name: string;
  observed_trips: number;
  scheduled_trips: number;
  delivered_pct: number;
}

export interface ServiceDeliveryResponse {
  period_days: number;
  observed_trips: number;
  scheduled_trips: number;
  delivered_pct: number;
  routes: ServiceDeliveryRoute[];
}

export interface HourHeadway {
  hour: number;
  headway_minutes: number | null;
}

export interface ScheduleFrequencyRoute {
  route_id: string;
  route_short_name: string;
  weekday_trips: number;
  saturday_trips: number;
  sunday_trips: number;
  span_start: string | null;
  span_end: string | null;
  headways_by_hour: HourHeadway[];
}

export interface ScheduleFrequencyResponse {
  route_id: string | null;
  routes: ScheduleFrequencyRoute[];
}

export interface OccupancyHourPoint {
  hour: number;
  empty: number;
  many_seats: number;
  few_seats: number;
  standing: number;
  crushed: number;
  full: number;
  not_accepting: number;
  unknown: number;
  total: number;
}

export interface DirectionInfo {
  direction_id: number;
  headsign: string;
}

export interface OccupancyResponse {
  period_days: number;
  route_id: string | null;
  direction: number | null;
  reported: boolean;
  empty: number;
  many_seats: number;
  few_seats: number;
  standing: number;
  crushed: number;
  full: number;
  not_accepting: number;
  low: number;
  medium: number;
  high: number;
  unknown: number;
  samples: number;
  standing_pct: number | null;
  by_hour: OccupancyHourPoint[];
  directions: DirectionInfo[];
}

export interface RidershipPoint {
  month: string;
  boardings: number;
}

export interface RidershipRoute {
  route_id: string;
  route_short_name: string;
  boardings: number;
}

export interface RidershipResponse {
  route_id: string | null;
  available: boolean;
  latest_month: string | null;
  latest_total: number | null;
  prev_total: number | null;
  series: RidershipPoint[];
  by_route_latest: RidershipRoute[];
}

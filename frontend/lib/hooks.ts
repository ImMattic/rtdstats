"use client";
import { useQuery } from "@tanstack/react-query";
import {
  fetchVehicles,
  fetchVehiclesByRoute,
  fetchRoutes,
  fetchRailShapes,
  fetchRouteShape,
  fetchRouteStops,
  fetchHistorical,
  fetchOnTime,
  fetchFrequency,
  fetchAlerts,
  fetchOverview,
  fetchOnTimeTrend,
  fetchHeatmap,
  fetchDistribution,
  fetchWorstStops,
  fetchServiceDelivery,
  fetchScheduleFrequency,
  fetchOccupancy,
  fetchRidership,
  type HistoricalParams,
} from "./api";

// Analytics rollups change slowly (hourly/daily aggregates) — refresh every 5 min.
const ANALYTICS_INTERVAL = 300_000;

// Poll interval for real-time data (ms). RTD's GTFS-RT protobuf feed refreshes
// roughly every 30 seconds — fetching faster than the data changes is wasted work.
const REALTIME_INTERVAL = 30_000;

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
    refetchInterval: REALTIME_INTERVAL,
    staleTime: 0,
  });
}

export function useVehiclesByRoute(routeId: string) {
  return useQuery({
    queryKey: ["vehicles", routeId],
    queryFn: () => fetchVehiclesByRoute(routeId),
    refetchInterval: REALTIME_INTERVAL,
    staleTime: 0,
    enabled: Boolean(routeId),
  });
}

export function useRoutes() {
  return useQuery({
    queryKey: ["routes"],
    queryFn: fetchRoutes,
    staleTime: Infinity, // static data
  });
}

export function useHistorical(params: HistoricalParams) {
  return useQuery({
    queryKey: ["historical", params],
    queryFn: () => fetchHistorical(params),
    enabled: Object.keys(params).length > 0,
  });
}

export function useOnTime(days = 7, routeId?: string) {
  return useQuery({
    queryKey: ["ontime", days, routeId],
    queryFn: () => fetchOnTime(days, routeId),
    // Multi-day on-time stats barely move minute to minute.
    refetchInterval: 300_000,
    staleTime: 300_000,
  });
}

export function useFrequency(routeId?: string) {
  return useQuery({
    queryKey: ["frequency", routeId],
    queryFn: () => fetchFrequency(routeId),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
}

export function useOverview(days = 7, routeId?: string) {
  return useQuery({
    queryKey: ["overview", days, routeId],
    queryFn: () => fetchOverview(days, routeId),
    refetchInterval: ANALYTICS_INTERVAL,
    staleTime: ANALYTICS_INTERVAL,
  });
}

export function useOnTimeTrend(days = 14, routeId?: string, granularity: "hour" | "day" = "day") {
  return useQuery({
    queryKey: ["ontimeTrend", days, routeId, granularity],
    queryFn: () => fetchOnTimeTrend(days, routeId, granularity),
    refetchInterval: ANALYTICS_INTERVAL,
    staleTime: ANALYTICS_INTERVAL,
  });
}

export function useHeatmap(days = 30, routeId?: string) {
  return useQuery({
    queryKey: ["heatmap", days, routeId],
    queryFn: () => fetchHeatmap(days, routeId),
    refetchInterval: ANALYTICS_INTERVAL,
    staleTime: ANALYTICS_INTERVAL,
  });
}

export function useDistribution(days = 7, routeId?: string) {
  return useQuery({
    queryKey: ["distribution", days, routeId],
    queryFn: () => fetchDistribution(days, routeId),
    refetchInterval: ANALYTICS_INTERVAL,
    staleTime: ANALYTICS_INTERVAL,
  });
}

export function useWorstStops(days = 14, routeId?: string, limit = 15) {
  return useQuery({
    queryKey: ["worstStops", days, routeId, limit],
    queryFn: () => fetchWorstStops(days, routeId, limit),
    refetchInterval: ANALYTICS_INTERVAL,
    staleTime: ANALYTICS_INTERVAL,
  });
}

export function useServiceDelivery(days = 7, routeId?: string) {
  return useQuery({
    queryKey: ["serviceDelivery", days, routeId],
    queryFn: () => fetchServiceDelivery(days, routeId),
    refetchInterval: ANALYTICS_INTERVAL,
    staleTime: ANALYTICS_INTERVAL,
  });
}

export function useScheduleFrequency(routeId?: string) {
  return useQuery({
    queryKey: ["scheduleFrequency", routeId],
    queryFn: () => fetchScheduleFrequency(routeId),
    staleTime: Infinity, // derived from static GTFS
  });
}

export function useOccupancy(days = 7, routeId?: string, direction?: number) {
  return useQuery({
    queryKey: ["occupancy", days, routeId, direction],
    queryFn: () => fetchOccupancy(days, routeId, direction),
    refetchInterval: ANALYTICS_INTERVAL,
    staleTime: ANALYTICS_INTERVAL,
  });
}

export function useRidership(routeId?: string, months = 24) {
  return useQuery({
    queryKey: ["ridership", routeId, months],
    queryFn: () => fetchRidership(routeId, months),
    staleTime: ANALYTICS_INTERVAL,
  });
}

export function useRailShapes() {
  return useQuery({
    queryKey: ["railShapes"],
    queryFn: fetchRailShapes,
    staleTime: Infinity, // static GTFS data never changes at runtime
  });
}

export function useRouteShape(routeId?: string) {
  return useQuery({
    queryKey: ["routeShape", routeId],
    queryFn: () => fetchRouteShape(routeId!),
    staleTime: Infinity,
    enabled: Boolean(routeId),
  });
}

export function useRouteStops(routeId?: string) {
  return useQuery({
    queryKey: ["routeStops", routeId],
    queryFn: () => fetchRouteStops(routeId!),
    staleTime: Infinity,
    enabled: Boolean(routeId),
  });
}

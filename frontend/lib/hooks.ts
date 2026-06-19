"use client";
import { useQuery } from "@tanstack/react-query";
import {
  fetchVehicles,
  fetchVehiclesByRoute,
  fetchRoutes,
  fetchRailShapes,
  fetchRouteShape,
  fetchHistorical,
  fetchOnTime,
  fetchFrequency,
  fetchAlerts,
  type HistoricalParams,
} from "./api";

// Poll interval for real-time data (ms)
const REALTIME_INTERVAL = 7_000;

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
    refetchInterval: REALTIME_INTERVAL,
    staleTime: 5_000,
  });
}

export function useVehiclesByRoute(routeId: string) {
  return useQuery({
    queryKey: ["vehicles", routeId],
    queryFn: () => fetchVehiclesByRoute(routeId),
    refetchInterval: REALTIME_INTERVAL,
    staleTime: 5_000,
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
    refetchInterval: 60_000,
  });
}

export function useFrequency(routeId?: string) {
  return useQuery({
    queryKey: ["frequency", routeId],
    queryFn: () => fetchFrequency(routeId),
    refetchInterval: 30_000,
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
    refetchInterval: 30_000,
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

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RouteInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    route_id: str
    short_name: str
    long_name: str
    route_type: str
    type_name: str
    color: str
    agency_id: str


class VehiclePositionOut(BaseModel):
    """Live vehicle snapshot enriched with static GTFS route/stop data."""

    model_config = ConfigDict(from_attributes=True)

    vehicle_id: str | None
    vehicle_label: str | None
    trip_id: str | None
    route_id: str
    route_short_name: str
    route_long_name: str
    route_color: str
    route_type: str

    latitude: float | None
    longitude: float | None
    bearing: float | None

    current_stop_sequence: int | None
    current_status: int | None
    current_status_label: str | None
    stop_id: str | None
    stop_name: str | None
    occupancy_status: str | None

    timestamp: datetime

    # Delay info (sourced from TripUpdate feed)
    delay_seconds: int | None
    is_late: bool | None

    # Headway for the vehicle's route (minutes between consecutive vehicles)
    headway_minutes: float | None


class VehiclePositionHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    vehicle_id: str | None
    vehicle_label: str | None
    trip_id: str | None
    route_id: str
    latitude: float | None
    longitude: float | None
    bearing: float | None
    current_status: int | None
    stop_id: str | None
    occupancy_status: str | None
    timestamp: datetime
    delay_seconds: int | None


class RealtimeResponse(BaseModel):
    updated_at: datetime
    vehicles: list[VehiclePositionOut]
    route_headways: dict[str, float]

    # Debug/count fields (helpful for troubleshooting client vs server counts)
    total_vehicles: int | None = None
    vehicles_with_location: int | None = None
    unique_vehicle_keys: int | None = None

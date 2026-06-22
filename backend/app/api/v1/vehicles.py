"""Vehicle drill-down: active vehicles for a time window + per-vehicle trip detail."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vehicle_position import VehiclePosition
from app.models.stop_arrival import StopArrivalEvent
from app.models.trip_update import TripUpdate
from app.services.gtfs_decoder import load_gtfs_static_data

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.get("/active")
async def get_active_vehicles(
    db: Annotated[AsyncSession, Depends(get_db)],
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    route_id: Annotated[str | None, Query()] = None,
) -> dict:
    """Distinct vehicles that had a position update in [start, end]."""
    now = datetime.now(tz=timezone.utc)
    end = end or now
    start = start or (end - timedelta(hours=1))

    base_filter = [
        VehiclePosition.timestamp >= start,
        VehiclePosition.timestamp <= end,
    ]
    if route_id:
        base_filter.append(VehiclePosition.route_id == route_id)

    # Latest row per vehicle_label via DISTINCT ON
    latest_stmt = (
        select(
            VehiclePosition.vehicle_label,
            VehiclePosition.vehicle_id,
            VehiclePosition.trip_id,
            VehiclePosition.route_id,
            VehiclePosition.latitude,
            VehiclePosition.longitude,
            VehiclePosition.occupancy_status,
            VehiclePosition.timestamp.label("last_seen"),
        )
        .where(*base_filter)
        .distinct(VehiclePosition.vehicle_label)
        .order_by(VehiclePosition.vehicle_label, VehiclePosition.timestamp.desc())
    )

    # first_seen + observation count per vehicle
    agg_stmt = (
        select(
            VehiclePosition.vehicle_label,
            func.min(VehiclePosition.timestamp).label("first_seen"),
            func.count().label("observation_count"),
        )
        .where(*base_filter)
        .group_by(VehiclePosition.vehicle_label)
    )

    latest_rows = (await db.execute(latest_stmt)).all()
    agg_rows = (await db.execute(agg_stmt)).all()

    agg_map: dict[str | None, tuple[datetime, int]] = {
        r.vehicle_label: (r.first_seen, r.observation_count) for r in agg_rows
    }

    routes_static, _ = load_gtfs_static_data()
    trip_ids = {r.trip_id for r in latest_rows if r.trip_id}
    delay_map = await _delay_map(db, start, end, trip_ids)

    vehicles = []
    for r in latest_rows:
        first_seen, obs_count = agg_map.get(r.vehicle_label, (r.last_seen, 1))
        vehicles.append(
            {
                "vehicle_label": r.vehicle_label,
                "vehicle_id": r.vehicle_id,
                "trip_id": r.trip_id,
                "route_id": r.route_id,
                "route_short_name": routes_static.get(r.route_id, {}).get("route_short_name"),
                "route_color": routes_static.get(r.route_id, {}).get("route_color"),
                "first_seen": first_seen.isoformat(),
                "last_seen": r.last_seen.isoformat(),
                "last_latitude": r.latitude,
                "last_longitude": r.longitude,
                "last_occupancy_status": r.occupancy_status,
                "last_delay_seconds": delay_map.get(r.trip_id or ""),
                "observation_count": obs_count,
            }
        )

    vehicles.sort(key=lambda v: (v["route_short_name"] or "", v["vehicle_label"] or ""))

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "vehicle_count": len(vehicles),
        "vehicles": vehicles,
    }


@router.get("/{vehicle_label}/trip")
async def get_vehicle_trip(
    vehicle_label: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    trip_id: Annotated[str | None, Query()] = None,
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
) -> dict:
    """Stop arrival timeline and position track for a specific vehicle's trip."""
    now = datetime.now(tz=timezone.utc)
    end = end or now
    start = start or (end - timedelta(hours=6))

    pos_filter = [
        VehiclePosition.vehicle_label == vehicle_label,
        VehiclePosition.timestamp >= start,
        VehiclePosition.timestamp <= end,
    ]
    if trip_id:
        pos_filter.append(VehiclePosition.trip_id == trip_id)

    pos_stmt = (
        select(
            VehiclePosition.vehicle_id,
            VehiclePosition.trip_id,
            VehiclePosition.route_id,
            VehiclePosition.latitude,
            VehiclePosition.longitude,
            VehiclePosition.bearing,
            VehiclePosition.current_status,
            VehiclePosition.occupancy_status,
            VehiclePosition.timestamp,
        )
        .where(*pos_filter)
        .order_by(VehiclePosition.timestamp.asc())
    )

    pos_rows = (await db.execute(pos_stmt)).all()

    if not pos_rows:
        return {
            "vehicle_label": vehicle_label,
            "vehicle_id": None,
            "trip_id": trip_id,
            "route_id": None,
            "route_short_name": None,
            "route_long_name": None,
            "route_color": None,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "stops": [],
            "positions": [],
            "avg_delay_seconds": None,
            "on_time_pct": None,
            "observation_count": 0,
        }

    last_row = pos_rows[-1]
    resolved_trip_id = trip_id or last_row.trip_id
    resolved_route_id = last_row.route_id
    vehicle_id = last_row.vehicle_id

    routes_static, stops_static = load_gtfs_static_data()
    route_info = routes_static.get(resolved_route_id, {})

    stops_list: list[dict] = []
    if resolved_trip_id:
        arrival_stmt = (
            select(StopArrivalEvent)
            .where(
                StopArrivalEvent.trip_id == resolved_trip_id,
                StopArrivalEvent.timestamp >= start,
                StopArrivalEvent.timestamp <= end,
            )
            .order_by(StopArrivalEvent.stop_sequence.asc())
        )
        for ev in (await db.execute(arrival_stmt)).scalars().all():
            stop_info = stops_static.get(ev.stop_id, {})
            stops_list.append(
                {
                    "stop_id": ev.stop_id,
                    "stop_name": stop_info.get("stop_name"),
                    "stop_lat": stop_info.get("stop_lat"),
                    "stop_lon": stop_info.get("stop_lon"),
                    "stop_sequence": ev.stop_sequence,
                    "scheduled_time": ev.scheduled_time.isoformat(),
                    "actual_time": ev.actual_time.isoformat(),
                    "delay_seconds": ev.delay_seconds,
                }
            )

    avg_delay: float | None = None
    on_time_pct: float | None = None
    if stops_list:
        delays = [s["delay_seconds"] for s in stops_list]
        avg_delay = sum(delays) / len(delays)
        on_time_count = sum(1 for d in delays if abs(d) <= 120)
        on_time_pct = round(on_time_count / len(delays) * 100, 1)

    positions = [
        {
            "latitude": r.latitude,
            "longitude": r.longitude,
            "bearing": r.bearing,
            "timestamp": r.timestamp.isoformat(),
            "current_status": r.current_status,
            "occupancy_status": r.occupancy_status,
        }
        for r in pos_rows
        if r.latitude is not None and r.longitude is not None
    ]

    return {
        "vehicle_label": vehicle_label,
        "vehicle_id": vehicle_id,
        "trip_id": resolved_trip_id,
        "route_id": resolved_route_id,
        "route_short_name": route_info.get("route_short_name"),
        "route_long_name": route_info.get("route_long_name"),
        "route_color": route_info.get("route_color"),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "stops": stops_list,
        "positions": positions,
        "avg_delay_seconds": avg_delay,
        "on_time_pct": on_time_pct,
        "observation_count": len(pos_rows),
    }


async def _delay_map(
    db: AsyncSession,
    start: datetime,
    end: datetime,
    trip_ids: set[str],
) -> dict[str, int]:
    if not trip_ids:
        return {}
    stmt = (
        select(TripUpdate.trip_id, TripUpdate.arrival_delay)
        .where(
            TripUpdate.trip_id.in_(trip_ids),
            TripUpdate.timestamp >= start,
            TripUpdate.timestamp <= end,
            TripUpdate.arrival_delay.is_not(None),
        )
        .order_by(TripUpdate.trip_id, TripUpdate.timestamp.desc())
        .distinct(TripUpdate.trip_id)
    )
    result = await db.execute(stmt)
    return {tid: delay for tid, delay in result.all() if tid is not None}

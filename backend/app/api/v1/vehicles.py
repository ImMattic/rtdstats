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
from app.services.gtfs_decoder import load_gtfs_static_data, load_trip_endpoint_sequences

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

# A trip can begin before / end after the requested window.  We scan this much
# extra on each side so each trip's *true* first→last position is captured and
# we can decide whether its start or end lands in the window.  3h comfortably
# covers RTD's longest routes.
_MAX_TRIP_DURATION = timedelta(hours=3)

# {trip_id: (first_stop_id, last_stop_id)} from the static schedule.  Parsing
# stop_times.txt is expensive, so cache it at module level (same pattern as
# stats.py) and load lazily on first use.
_TRIP_ENDPOINT_STOPS: dict[str, tuple[str | None, str | None]] | None = None


def _trip_endpoint_stops() -> dict[str, tuple[str | None, str | None]]:
    global _TRIP_ENDPOINT_STOPS
    if _TRIP_ENDPOINT_STOPS is None:
        _, _TRIP_ENDPOINT_STOPS = load_trip_endpoint_sequences()
    return _TRIP_ENDPOINT_STOPS


@router.get("/active")
async def get_active_vehicles(
    db: Annotated[AsyncSession, Depends(get_db)],
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    route_id: Annotated[str | None, Query()] = None,
) -> dict:
    """Trips whose start or end falls within [start, end].

    A *trip* is one ``(vehicle_label, trip_id)`` leg.  We scan a window padded
    by ``_MAX_TRIP_DURATION`` on each side so a trip's full extent
    (first→last position) is captured even when it begins before / ends after
    the requested window, then keep only trips whose start or end timestamp is
    actually inside ``[start, end]``.
    """
    now = datetime.now(tz=timezone.utc)
    end = end or now
    start = start or (end - timedelta(hours=1))

    scan_start = start - _MAX_TRIP_DURATION
    scan_end = end + _MAX_TRIP_DURATION

    base_filter = [
        VehiclePosition.timestamp >= scan_start,
        VehiclePosition.timestamp <= scan_end,
    ]
    if route_id:
        base_filter.append(VehiclePosition.route_id == route_id)

    # Latest row per (vehicle_label, trip_id) — for route / occupancy / position.
    latest_stmt = (
        select(
            VehiclePosition.vehicle_label,
            VehiclePosition.vehicle_id,
            VehiclePosition.trip_id,
            VehiclePosition.route_id,
            VehiclePosition.latitude,
            VehiclePosition.longitude,
            VehiclePosition.occupancy_status,
        )
        .where(*base_filter)
        .distinct(VehiclePosition.vehicle_label, VehiclePosition.trip_id)
        .order_by(
            VehiclePosition.vehicle_label,
            VehiclePosition.trip_id,
            VehiclePosition.timestamp.desc(),
        )
    )

    # start_time / end_time / observation count per (vehicle_label, trip_id).
    agg_stmt = (
        select(
            VehiclePosition.vehicle_label,
            VehiclePosition.trip_id,
            func.min(VehiclePosition.timestamp).label("start_time"),
            func.max(VehiclePosition.timestamp).label("end_time"),
            func.count().label("observation_count"),
        )
        .where(*base_filter)
        .group_by(VehiclePosition.vehicle_label, VehiclePosition.trip_id)
    )

    latest_rows = (await db.execute(latest_stmt)).all()
    agg_rows = (await db.execute(agg_stmt)).all()

    agg_map: dict[tuple[str | None, str | None], tuple[datetime, datetime, int]] = {
        (r.vehicle_label, r.trip_id): (r.start_time, r.end_time, r.observation_count)
        for r in agg_rows
    }

    routes_static, stops_static = load_gtfs_static_data()
    endpoint_stops = _trip_endpoint_stops()
    trip_ids = {r.trip_id for r in latest_rows if r.trip_id}
    delay_map = await _delay_map(db, scan_start, scan_end, trip_ids)
    arrival_count_map = await _arrival_count_map(db, scan_start, scan_end, trip_ids)

    vehicles = []
    for r in latest_rows:
        agg = agg_map.get((r.vehicle_label, r.trip_id))
        if agg is None:
            continue
        trip_start, trip_end, obs_count = agg

        # Keep only legs that start or end inside the requested window.
        if not (start <= trip_start <= end or start <= trip_end <= end):
            continue

        first_sid, last_sid = endpoint_stops.get(r.trip_id or "", (None, None))
        vehicles.append(
            {
                "vehicle_label": r.vehicle_label,
                "vehicle_id": r.vehicle_id,
                "trip_id": r.trip_id,
                "route_id": r.route_id,
                "route_short_name": routes_static.get(r.route_id, {}).get("route_short_name"),
                "route_color": routes_static.get(r.route_id, {}).get("route_color"),
                "start_time": trip_start.isoformat(),
                "end_time": trip_end.isoformat(),
                "start_stop_name": (
                    stops_static.get(first_sid, {}).get("stop_name") if first_sid else None
                ),
                "end_stop_name": (
                    stops_static.get(last_sid, {}).get("stop_name") if last_sid else None
                ),
                "last_latitude": r.latitude,
                "last_longitude": r.longitude,
                "last_occupancy_status": r.occupancy_status,
                "last_delay_seconds": delay_map.get(r.trip_id or ""),
                "observation_count": obs_count,
                "stop_arrival_count": arrival_count_map.get(r.trip_id or "", 0),
            }
        )

    vehicles.sort(key=lambda v: (v["start_time"], v["route_short_name"] or ""))

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

    # Occupancy timeline from the position snapshots, used to label each stop
    # with the occupancy reported closest in time to the observed arrival.
    occ_timeline = [
        (r.timestamp, r.occupancy_status)
        for r in pos_rows
        if r.occupancy_status is not None
    ]

    def _occupancy_at(t: datetime) -> str | None:
        if not occ_timeline:
            return None
        return min(occ_timeline, key=lambda pair: abs((pair[0] - t).total_seconds()))[1]

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
                    "occupancy_status": _occupancy_at(ev.actual_time),
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


async def _arrival_count_map(
    db: AsyncSession,
    start: datetime,
    end: datetime,
    trip_ids: set[str],
) -> dict[str, int]:
    if not trip_ids:
        return {}
    stmt = (
        select(StopArrivalEvent.trip_id, func.count().label("arrival_count"))
        .where(
            StopArrivalEvent.trip_id.in_(trip_ids),
            StopArrivalEvent.timestamp >= start,
            StopArrivalEvent.timestamp <= end,
        )
        .group_by(StopArrivalEvent.trip_id)
    )
    result = await db.execute(stmt)
    return {tid: cnt for tid, cnt in result.all() if tid is not None}


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

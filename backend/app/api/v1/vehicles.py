"""Vehicle drill-down: active vehicles for a time window + per-vehicle trip detail."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, text
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


# One CTE query that:
#   1. Aggregates vehicle_positions in the scan window into one row per
#      (vehicle_label, trip_id) using TimescaleDB LAST() — replaces the old
#      DISTINCT ON + separate GROUP BY double-scan.
#   2. Joins stop_arrival_events (scoped to qualified trips) for arrival counts.
#   3. Applies the time-window and quality filters entirely in SQL.
#   4. Returns a total_count via window function alongside the paginated rows.
#
# The {route_clause} placeholder is either empty or "AND route_id = :route_id".
_ACTIVE_VEHICLES_SQL = """
WITH agg AS (
    SELECT
        vehicle_label,
        trip_id,
        MIN(timestamp)                    AS start_time,
        MAX(timestamp)                    AS end_time,
        COUNT(*)                          AS observation_count,
        LAST(route_id,         timestamp) AS route_id,
        LAST(vehicle_id,       timestamp) AS vehicle_id,
        LAST(latitude,         timestamp) AS latitude,
        LAST(longitude,        timestamp) AS longitude,
        LAST(occupancy_status, timestamp) AS occupancy_status
    FROM vehicle_positions
    WHERE timestamp >= :scan_start
      AND timestamp <= :scan_end
      {route_clause}
    GROUP BY vehicle_label, trip_id
    HAVING COUNT(*) >= 10
),
arrivals AS (
    SELECT sae.trip_id, COUNT(*) AS arrival_count
    FROM stop_arrival_events sae
    WHERE sae.timestamp >= :scan_start
      AND sae.timestamp <= :scan_end
      AND sae.trip_id IN (SELECT trip_id FROM agg WHERE trip_id IS NOT NULL)
    GROUP BY sae.trip_id
),
filtered AS (
    SELECT
        a.*,
        COALESCE(ar.arrival_count, 0) AS stop_arrival_count
    FROM agg a
    LEFT JOIN arrivals ar ON ar.trip_id = a.trip_id
    WHERE (
        (a.start_time >= :start AND a.start_time <= :end)
        OR  (a.end_time  >= :start AND a.end_time  <= :end)
    )
      AND COALESCE(ar.arrival_count, 0) > 1
),
paged AS (
    SELECT
        *,
        COUNT(*) OVER () AS total_count
    FROM filtered
    ORDER BY start_time ASC, route_id ASC NULLS LAST
    LIMIT  :limit
    OFFSET :offset
)
SELECT * FROM paged
"""


@router.get("/active")
async def get_active_vehicles(
    db: Annotated[AsyncSession, Depends(get_db)],
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    route_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 15,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    """Trips whose start or end falls within [start, end].

    A *trip* is one ``(vehicle_label, trip_id)`` leg.  We scan a window padded
    by ``_MAX_TRIP_DURATION`` on each side so a trip's full extent
    (first→last position) is captured even when it begins before / ends after
    the requested window, then keep only trips whose start or end timestamp is
    actually inside ``[start, end]``.

    Quality filter (same criteria as before) is applied in SQL:
    observation_count >= 10 AND stop_arrival_count > 1.
    """
    now = datetime.now(tz=timezone.utc)
    end = end or now
    start = start or (end - timedelta(hours=1))

    scan_start = start - _MAX_TRIP_DURATION
    scan_end = end + _MAX_TRIP_DURATION

    route_clause = "AND route_id = :route_id" if route_id else ""
    sql = text(_ACTIVE_VEHICLES_SQL.format(route_clause=route_clause))

    params: dict = {
        "scan_start": scan_start,
        "scan_end": scan_end,
        "start": start,
        "end": end,
        "limit": limit,
        "offset": offset,
    }
    if route_id:
        params["route_id"] = route_id

    rows = (await db.execute(sql, params)).mappings().all()

    if not rows:
        return {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "vehicle_count": 0,
            "vehicles": [],
        }

    total_count: int = rows[0]["total_count"]
    trip_ids = {r["trip_id"] for r in rows if r["trip_id"]}
    delay_map = await _delay_map(db, scan_start, scan_end, trip_ids)

    routes_static, stops_static = load_gtfs_static_data()
    endpoint_stops = _trip_endpoint_stops()

    vehicles = []
    for r in rows:
        first_sid, last_sid = endpoint_stops.get(r["trip_id"] or "", (None, None))
        vehicles.append(
            {
                "vehicle_label": r["vehicle_label"],
                "vehicle_id": r["vehicle_id"],
                "trip_id": r["trip_id"],
                "route_id": r["route_id"],
                "route_short_name": routes_static.get(r["route_id"], {}).get("route_short_name"),
                "route_color": routes_static.get(r["route_id"], {}).get("route_color"),
                "start_time": r["start_time"].isoformat(),
                "end_time": r["end_time"].isoformat(),
                "start_stop_name": (
                    stops_static.get(first_sid, {}).get("stop_name") if first_sid else None
                ),
                "end_stop_name": (
                    stops_static.get(last_sid, {}).get("stop_name") if last_sid else None
                ),
                "last_latitude": r["latitude"],
                "last_longitude": r["longitude"],
                "last_occupancy_status": r["occupancy_status"],
                "last_delay_seconds": delay_map.get(r["trip_id"] or ""),
                "observation_count": r["observation_count"],
                "stop_arrival_count": r["stop_arrival_count"],
            }
        )

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "vehicle_count": total_count,
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

"""Vehicle drill-down: active vehicles for a time window + per-vehicle trip detail."""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.vehicle_position import VehiclePosition
from app.models.stop_arrival import StopArrivalEvent
from app.models.trip_update import TripUpdate
from app.services.gtfs_decoder import load_gtfs_static_data, load_trip_endpoint_sequences
from app.services.gtfs_schedule import load_trip_origin_timepoints, load_trip_stop_sequence

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

_settings = get_settings()
_DENVER = ZoneInfo("America/Denver")


def _validated_range(
    start: datetime | None,
    end: datetime | None,
    default_span: timedelta,
) -> tuple[datetime, datetime]:
    """Fill in defaults and reject inverted or abusively wide time ranges."""
    now = datetime.now(tz=timezone.utc)
    end = end or now
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    start = start or (end - default_span)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if start >= end:
        raise HTTPException(status_code=422, detail="start must be before end")
    if end - start > timedelta(hours=_settings.vehicles_max_span_hours):
        raise HTTPException(
            status_code=422,
            detail=f"time range too large: max {_settings.vehicles_max_span_hours}h",
        )
    return start, end

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
# The {window_clause} placeholder bounds a trip to the requested window: by
# default a trip qualifies if its start OR end lands inside [start, end];  in
# strict mode both its start AND end must land inside it (trips that begin
# before or run past the window are dropped entirely).
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
        {window_clause}
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

# Time-window clauses substituted into {window_clause} above.
_WINDOW_CLAUSE_OVERLAP = (
    "(a.start_time >= :start AND a.start_time <= :end)"
    " OR (a.end_time >= :start AND a.end_time <= :end)"
)
_WINDOW_CLAUSE_STRICT = "a.start_time >= :start AND a.end_time <= :end"


@router.get("/active")
async def get_active_vehicles(
    db: Annotated[AsyncSession, Depends(get_db)],
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    route_id: Annotated[str | None, Query()] = None,
    strict: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 15,
    offset: Annotated[int, Query(ge=0, le=5_000)] = 0,
) -> dict:
    """Trips whose start or end falls within [start, end].

    A *trip* is one ``(vehicle_label, trip_id)`` leg.  We scan a window padded
    by ``_MAX_TRIP_DURATION`` on each side so a trip's full extent
    (first→last position) is captured even when it begins before / ends after
    the requested window, then keep only trips whose start or end timestamp is
    actually inside ``[start, end]``.

    When ``strict`` is true, only trips that lie *entirely* within
    ``[start, end]`` are kept — both start and end must fall inside the window,
    so a trip that begins before or runs past the window is excluded.

    Quality filter (same criteria as before) is applied in SQL:
    observation_count >= 10 AND stop_arrival_count > 1.
    """
    start, end = _validated_range(start, end, default_span=timedelta(hours=1))

    scan_start = start - _MAX_TRIP_DURATION
    scan_end = end + _MAX_TRIP_DURATION

    route_clause = "AND route_id = :route_id" if route_id else ""
    window_clause = _WINDOW_CLAUSE_STRICT if strict else _WINDOW_CLAUSE_OVERLAP
    sql = text(
        _ACTIVE_VEHICLES_SQL.format(
            route_clause=route_clause,
            window_clause=window_clause,
        )
    )

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
    start, end = _validated_range(start, end, default_span=timedelta(hours=6))

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
            "scheduled_stop_count": 0,
            "observed_stop_count": 0,
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
        # Geofenced arrivals, keyed by stop_sequence — the subset of stops we
        # actually observed the vehicle reach.
        observed: dict[int, StopArrivalEvent] = {
            ev.stop_sequence: ev
            for ev in (await db.execute(arrival_stmt)).scalars().all()
        }

        # The full RTD schedule for this trip: every stop, origin → destination.
        schedule = load_trip_stop_sequence(resolved_trip_id)

        # The origin is timed by departure, not arrival (services/ontime.py), so
        # label it as such rather than letting the UI imply the bus "arrived" at
        # the stop it started from.
        origin = load_trip_origin_timepoints().get(resolved_trip_id)
        origin_seq = origin[0] if origin else None

        def _event_type(seq: int) -> str:
            return "departure" if seq == origin_seq else "arrival"

        if schedule:
            # Anchor the GTFS service day so stops we never geofenced still get
            # an absolute scheduled time.
            anchor = _service_day_anchor(schedule, observed, pos_rows)
            scheduled_seqs = {s["stop_sequence"] for s in schedule}
            for s in schedule:
                seq = s["stop_sequence"]
                ev = observed.get(seq)
                if ev is not None:
                    scheduled_iso = ev.scheduled_time.isoformat()
                elif anchor is not None and s["arrival_secs"] is not None:
                    scheduled_iso = (
                        anchor + timedelta(seconds=s["arrival_secs"])
                    ).isoformat()
                else:
                    scheduled_iso = None
                stops_list.append(
                    {
                        "stop_id": s["stop_id"],
                        "stop_name": s["stop_name"],
                        "stop_lat": s["stop_lat"],
                        "stop_lon": s["stop_lon"],
                        "stop_sequence": seq,
                        "stop_headsign": s["stop_headsign"],
                        "is_timepoint": s["is_timepoint"],
                        "pickup_type": s["pickup_type"],
                        "drop_off_type": s["drop_off_type"],
                        "scheduled_time": scheduled_iso,
                        "observed": ev is not None,
                        "event_type": _event_type(seq) if ev else None,
                        "actual_time": ev.actual_time.isoformat() if ev else None,
                        "delay_seconds": ev.delay_seconds if ev else None,
                        "occupancy_status": _occupancy_at(ev.actual_time) if ev else None,
                        "actual_lat": ev.actual_lat if ev else None,
                        "actual_lon": ev.actual_lon if ev else None,
                        "actual_bearing": ev.actual_bearing if ev else None,
                    }
                )

            # Keep any observed arrival whose stop_sequence isn't in the current
            # schedule (GTFS bundle drift) rather than silently dropping it.
            for seq, ev in sorted(observed.items()):
                if seq in scheduled_seqs:
                    continue
                stop_info = stops_static.get(ev.stop_id, {})
                stops_list.append(
                    {
                        "stop_id": ev.stop_id,
                        "stop_name": stop_info.get("stop_name"),
                        "stop_lat": stop_info.get("stop_lat"),
                        "stop_lon": stop_info.get("stop_lon"),
                        "stop_sequence": ev.stop_sequence,
                        "stop_headsign": None,
                        "is_timepoint": True,
                        "pickup_type": "0",
                        "drop_off_type": "0",
                        "scheduled_time": ev.scheduled_time.isoformat(),
                        "observed": True,
                        "event_type": _event_type(ev.stop_sequence),
                        "actual_time": ev.actual_time.isoformat(),
                        "delay_seconds": ev.delay_seconds,
                        "occupancy_status": _occupancy_at(ev.actual_time),
                        "actual_lat": ev.actual_lat,
                        "actual_lon": ev.actual_lon,
                        "actual_bearing": ev.actual_bearing,
                    }
                )
            stops_list.sort(key=lambda s: s["stop_sequence"])
        else:
            # Trip absent from the bundled static schedule — fall back to the
            # geofenced arrivals alone (pre-full-timeline behaviour).
            for seq, ev in sorted(observed.items()):
                stop_info = stops_static.get(ev.stop_id, {})
                stops_list.append(
                    {
                        "stop_id": ev.stop_id,
                        "stop_name": stop_info.get("stop_name"),
                        "stop_lat": stop_info.get("stop_lat"),
                        "stop_lon": stop_info.get("stop_lon"),
                        "stop_sequence": ev.stop_sequence,
                        "stop_headsign": None,
                        "is_timepoint": True,
                        "pickup_type": "0",
                        "drop_off_type": "0",
                        "scheduled_time": ev.scheduled_time.isoformat(),
                        "observed": True,
                        "event_type": _event_type(ev.stop_sequence),
                        "actual_time": ev.actual_time.isoformat(),
                        "delay_seconds": ev.delay_seconds,
                        "occupancy_status": _occupancy_at(ev.actual_time),
                        "actual_lat": ev.actual_lat,
                        "actual_lon": ev.actual_lon,
                        "actual_bearing": ev.actual_bearing,
                    }
                )

    avg_delay: float | None = None
    on_time_pct: float | None = None
    observed_delays = [
        s["delay_seconds"] for s in stops_list if s["observed"] and s["delay_seconds"] is not None
    ]
    if observed_delays:
        avg_delay = sum(observed_delays) / len(observed_delays)
        on_time_count = sum(1 for d in observed_delays if abs(d) <= 300)
        on_time_pct = round(on_time_count / len(observed_delays) * 100, 1)

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
        "route_type": route_info.get("route_type"),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "stops": stops_list,
        "scheduled_stop_count": len(stops_list),
        "observed_stop_count": sum(1 for s in stops_list if s["observed"]),
        "positions": positions,
        "avg_delay_seconds": avg_delay,
        "on_time_pct": on_time_pct,
        "observation_count": len(pos_rows),
    }


def _service_day_anchor(
    schedule: tuple[dict, ...],
    observed: dict[int, StopArrivalEvent],
    pos_rows: list,
) -> datetime | None:
    """UTC instant of this trip's GTFS service-day midnight (America/Denver).

    Lets us put an absolute clock on scheduled stops the vehicle was never
    geofenced at.  Prefer an observed arrival (its ``scheduled_time`` minus the
    stop's seconds-since-midnight offset is exact); otherwise infer the service
    date from the position track, testing the day before / after as well so a
    trip that runs past midnight still resolves.
    """
    secs_by_seq = {s["stop_sequence"]: s["arrival_secs"] for s in schedule}

    for seq, ev in observed.items():
        offset = secs_by_seq.get(seq)
        if offset is not None:
            return ev.scheduled_time - timedelta(seconds=offset)

    if not pos_rows or not schedule:
        return None
    first_offset = schedule[0]["arrival_secs"]
    if first_offset is None:
        return None
    track_start = pos_rows[0].timestamp
    if track_start.tzinfo is None:
        track_start = track_start.replace(tzinfo=timezone.utc)
    local_date = track_start.astimezone(_DENVER).date()

    best: datetime | None = None
    best_gap: float | None = None
    for delta_days in (0, -1, 1):
        midnight = datetime.combine(
            local_date + timedelta(days=delta_days), time(0, 0), tzinfo=_DENVER
        ).astimezone(timezone.utc)
        gap = abs(
            ((midnight + timedelta(seconds=first_offset)) - track_start).total_seconds()
        )
        if best_gap is None or gap < best_gap:
            best_gap, best = gap, midnight
    return best


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

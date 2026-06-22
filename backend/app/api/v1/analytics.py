"""Deep analytics endpoints powering the rebuilt Dashboard & Historical pages.

All time-series/aggregate endpoints read the continuous aggregates created in
migration 003 (trip_ontime_hourly, stop_delay_daily, occupancy_hourly,
trip_activity_daily) so they stay fast over long windows.  Ridership reads the
plain ridership_monthly table.  Route names are enriched from GTFS static via
load_gtfs_static_data(), mirroring stats.py.

Hour-of-day / day-of-week are reported in America/Denver local time so the
heatmap and occupancy-by-hour charts read naturally to a Denver audience.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import ARRAY, String, bindparam, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.ridership import RidershipMonthly
from app.schemas.analytics import (
    DirectionInfo,
    DistributionBin,
    DistributionResponse,
    HeatmapCell,
    HeatmapResponse,
    HourHeadway,
    MetricWithDelta,
    OccupancyHourPoint,
    OccupancyResponse,
    OverviewResponse,
    RidershipPoint,
    RidershipResponse,
    RidershipRoute,
    ScheduleFrequencyResponse,
    ScheduleFrequencyRoute,
    ServiceDeliveryResponse,
    ServiceDeliveryRoute,
    TrendPoint,
    TrendResponse,
    WorstStop,
    WorstStopsResponse,
)
from app.services.gtfs_decoder import load_gtfs_static_data
from app.services.gtfs_schedule import load_route_direction_info, load_schedule_summary

router = APIRouter(prefix="/stats", tags=["analytics"])

_TZ = "America/Denver"

# Fine delay bins exposed by the distribution endpoint (matches migration 004:
# observed delay vs. schedule, on-time = ±2 min).
_DELAY_BINS = [
    ("very_early", "Very early (>5m)"),
    ("early", "Early (2–5m)"),
    ("on_time", "On time (±2m)"),
    ("slightly_late", "Slightly late (2–5m)"),
    ("late", "Late (5–10m)"),
    ("very_late", "Very late (>10m)"),
]


def _route_name(routes_static: dict[str, dict[str, Any]], rid: str) -> str:
    return routes_static.get(rid, {}).get("route_short_name", rid) or rid


def _cutoff(days: int) -> datetime:
    return datetime.now(tz=timezone.utc) - timedelta(days=days)


_DOW_NAMES = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def _count_daytypes(start: datetime, end: datetime) -> dict[str, int]:
    """Count occurrences of each day-of-week in [start, end] (inclusive of dates)."""
    counts: dict[str, int] = {d: 0 for d in _DOW_NAMES}
    d = start.date()
    end_d = end.date()
    while d <= end_d:
        counts[_DOW_NAMES[d.weekday()]] += 1
        d += timedelta(days=1)
    return counts


def _scheduled_trips(route_id: str, day_counts: dict[str, int]) -> int:
    s = load_schedule_summary().get(route_id)
    if not s:
        return 0
    tdow = s.get("trips_per_dow")
    if tdow:
        return sum(tdow.get(dow, 0) * cnt for dow, cnt in day_counts.items())
    # Fallback for a cached schedule built before trips_per_dow was added.
    wd = sum(day_counts.get(d, 0) for d in ("monday", "tuesday", "wednesday", "thursday", "friday"))
    return s["weekday_trips"] * wd + s["saturday_trips"] * day_counts.get("saturday", 0) + s["sunday_trips"] * day_counts.get("sunday", 0)


# ── Overview (hero KPIs) ────────────────────────────────────────────────────

_OVERVIEW_ONTIME_SQL = """
    SELECT
        sum(on_time)::bigint                            AS on_time,
        sum(slightly_late + late + very_late)::bigint  AS late,
        sum(very_early + early)::bigint                 AS early,
        sum(observations)::bigint                       AS observations,
        sum(delay_sum)::bigint                          AS delay_sum,
        sum(delay_sumsq)::numeric                       AS delay_sumsq,
        count(DISTINCT route_id)                        AS routes
    FROM trip_ontime_hourly
    WHERE bucket >= :start AND bucket < :end
      AND (:route_id IS NULL OR route_id = :route_id)
"""

_OBSERVED_TRIPS_SQL = """
    SELECT count(*)::bigint AS trips
    FROM trip_activity_daily
    WHERE bucket >= :start AND bucket < :end
      AND (:route_id IS NULL OR route_id = :route_id)
"""


async def _ontime_totals(db: AsyncSession, start: datetime, end: datetime,
                         route_id: str | None) -> dict[str, float]:
    row = (await db.execute(
        text(_OVERVIEW_ONTIME_SQL).bindparams(
            bindparam("start"), bindparam("end"),
            bindparam("route_id", type_=String),
        ),
        {"start": start, "end": end, "route_id": route_id},
    )).one()
    on_time, late, early, obs, dsum, dsumsq, routes = row
    return {
        "on_time": on_time or 0, "late": late or 0, "early": early or 0,
        "observations": obs or 0, "delay_sum": dsum or 0,
        "delay_sumsq": float(dsumsq or 0), "routes": routes or 0,
    }


def _pct_on_time(t: dict[str, float]) -> float:
    total = t["on_time"] + t["late"] + t["early"]
    return round(100 * t["on_time"] / total, 1) if total else 0.0


def _avg_delay(t: dict[str, float]) -> float:
    return round(t["delay_sum"] / t["observations"], 1) if t["observations"] else 0.0


def _stddev(t: dict[str, float]) -> float:
    n = t["observations"]
    if not n:
        return 0.0
    mean = t["delay_sum"] / n
    var = t["delay_sumsq"] / n - mean * mean
    return round(math.sqrt(var), 1) if var > 0 else 0.0


@router.get("/overview", response_model=OverviewResponse)
async def overview(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
    days: Annotated[int, Query(ge=1, le=90)] = 7,
) -> OverviewResponse:
    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(days=days)
    prev_start = start - timedelta(days=days)

    cur = await _ontime_totals(db, start, now, route_id)
    prev = await _ontime_totals(db, prev_start, start, route_id)

    observed = (await db.execute(
        text(_OBSERVED_TRIPS_SQL).bindparams(
            bindparam("start"), bindparam("end"),
            bindparam("route_id", type_=String),
        ),
        {"start": start, "end": now, "route_id": route_id},
    )).scalar() or 0
    observed_prev = (await db.execute(
        text(_OBSERVED_TRIPS_SQL).bindparams(
            bindparam("start"), bindparam("end"),
            bindparam("route_id", type_=String),
        ),
        {"start": prev_start, "end": start, "route_id": route_id},
    )).scalar() or 0

    routes_static, _ = load_gtfs_static_data()
    route_ids = [route_id] if route_id else list(routes_static.keys())

    def _sched(start_dt: datetime, end_dt: datetime) -> int:
        day_counts = _count_daytypes(start_dt, end_dt)
        return sum(_scheduled_trips(rid, day_counts) for rid in route_ids)

    sched = _sched(start, now)
    sched_prev = _sched(prev_start, start)
    delivered = round(min(100.0, 100 * observed / sched), 1) if sched else 0.0
    delivered_prev = round(min(100.0, 100 * observed_prev / sched_prev), 1) if sched_prev else 0.0

    # Latest ridership (system or route).
    rship = await _latest_ridership(db, route_id)

    return OverviewResponse(
        period_days=days,
        on_time_pct=MetricWithDelta(value=_pct_on_time(cur), previous=_pct_on_time(prev)),
        avg_delay_seconds=MetricWithDelta(value=_avg_delay(cur), previous=_avg_delay(prev)),
        delay_stddev_seconds=_stddev(cur),
        service_delivered_pct=MetricWithDelta(value=delivered, previous=delivered_prev),
        observed_trips=int(observed),
        scheduled_trips=int(sched),
        routes_tracked=int(cur["routes"]),
        total_observations=int(cur["observations"]),
        latest_ridership_month=rship[0],
        latest_ridership_total=rship[1],
        prev_ridership_total=rship[2],
    )


# ── On-time trend ───────────────────────────────────────────────────────────

@router.get("/ontime/trend", response_model=TrendResponse)
async def ontime_trend(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
    days: Annotated[int, Query(ge=1, le=90)] = 14,
    granularity: Annotated[str, Query(pattern="^(hour|day)$")] = "day",
) -> TrendResponse:
    if granularity == "hour":
        t_expr = "bucket"
    else:
        t_expr = f"date_trunc('day', bucket AT TIME ZONE '{_TZ}')"

    sql = f"""
        SELECT
            {t_expr}                                       AS t,
            sum(on_time)::bigint                           AS on_time,
            sum(slightly_late + late + very_late)::bigint AS late,
            sum(very_early + early)::bigint                AS early,
            sum(observations)::bigint                      AS observations,
            sum(delay_sum)::bigint                         AS delay_sum
        FROM trip_ontime_hourly
        WHERE bucket >= :cutoff
          AND (:route_id IS NULL OR route_id = :route_id)
        GROUP BY t
        ORDER BY t
    """
    rows = (await db.execute(
        text(sql).bindparams(bindparam("cutoff"), bindparam("route_id", type_=String)),
        {"cutoff": _cutoff(days), "route_id": route_id},
    )).all()

    points: list[TrendPoint] = []
    for t, on_time, late, early, obs, dsum in rows:
        total = (on_time or 0) + (late or 0) + (early or 0)
        points.append(TrendPoint(
            t=t.isoformat() if hasattr(t, "isoformat") else str(t),
            on_time_pct=round(100 * (on_time or 0) / total, 1) if total else 0.0,
            avg_delay_seconds=round((dsum or 0) / obs, 1) if obs else 0.0,
            observations=int(obs or 0),
        ))
    return TrendResponse(period_days=days, granularity=granularity, route_id=route_id, points=points)


# ── Heatmap (hour × day-of-week, local time) ────────────────────────────────

@router.get("/ontime/heatmap", response_model=HeatmapResponse)
async def ontime_heatmap(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
    days: Annotated[int, Query(ge=1, le=90)] = 30,
) -> HeatmapResponse:
    sql = f"""
        SELECT
            EXTRACT(dow  FROM bucket AT TIME ZONE '{_TZ}')::int AS dow,
            EXTRACT(hour FROM bucket AT TIME ZONE '{_TZ}')::int AS hour,
            sum(on_time)::bigint                           AS on_time,
            sum(slightly_late + late + very_late)::bigint AS late,
            sum(very_early + early)::bigint                AS early,
            sum(observations)::bigint                      AS observations,
            sum(delay_sum)::bigint                         AS delay_sum
        FROM trip_ontime_hourly
        WHERE bucket >= :cutoff
          AND (:route_id IS NULL OR route_id = :route_id)
        GROUP BY dow, hour
    """
    rows = (await db.execute(
        text(sql).bindparams(bindparam("cutoff"), bindparam("route_id", type_=String)),
        {"cutoff": _cutoff(days), "route_id": route_id},
    )).all()

    cells = []
    for dow, hour, on_time, late, early, obs, dsum in rows:
        total = (on_time or 0) + (late or 0) + (early or 0)
        cells.append(HeatmapCell(
            dow=int(dow), hour=int(hour),
            on_time_pct=round(100 * (on_time or 0) / total, 1) if total else 0.0,
            avg_delay_seconds=round((dsum or 0) / obs, 1) if obs else 0.0,
            observations=int(obs or 0),
        ))
    return HeatmapResponse(period_days=days, route_id=route_id, cells=cells)


# ── Delay distribution ──────────────────────────────────────────────────────

@router.get("/delay/distribution", response_model=DistributionResponse)
async def delay_distribution(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
    days: Annotated[int, Query(ge=1, le=90)] = 7,
) -> DistributionResponse:
    sql = """
        SELECT
            sum(very_early)::bigint    AS very_early,
            sum(early)::bigint         AS early,
            sum(on_time)::bigint       AS on_time,
            sum(slightly_late)::bigint AS slightly_late,
            sum(late)::bigint          AS late,
            sum(very_late)::bigint     AS very_late,
            sum(observations)::bigint  AS observations,
            sum(delay_sum)::bigint     AS delay_sum,
            sum(delay_sumsq)::numeric  AS delay_sumsq
        FROM trip_ontime_hourly
        WHERE bucket >= :cutoff
          AND (:route_id IS NULL OR route_id = :route_id)
    """
    row = (await db.execute(
        text(sql).bindparams(bindparam("cutoff"), bindparam("route_id", type_=String)),
        {"cutoff": _cutoff(days), "route_id": route_id},
    )).one()
    counts = {k: (row[i] or 0) for i, (k, _) in enumerate(_DELAY_BINS)}
    obs = row[6] or 0
    dsum = row[7] or 0
    dsumsq = float(row[8] or 0)
    total = sum(counts.values())
    mean = dsum / obs if obs else 0.0
    var = (dsumsq / obs - mean * mean) if obs else 0.0
    stddev = round(math.sqrt(var), 1) if var > 0 else 0.0

    bins = [
        DistributionBin(
            key=key, label=label, count=int(counts[key]),
            pct=round(100 * counts[key] / total, 1) if total else 0.0,
        )
        for key, label in _DELAY_BINS
    ]
    return DistributionResponse(
        period_days=days, route_id=route_id, total=int(total),
        avg_delay_seconds=round(mean, 1), stddev_seconds=stddev, bins=bins,
    )


# ── Worst stops ─────────────────────────────────────────────────────────────

@router.get("/stops/worst", response_model=WorstStopsResponse)
async def worst_stops(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
    days: Annotated[int, Query(ge=1, le=90)] = 14,
    limit: Annotated[int, Query(ge=1, le=100)] = 15,
    min_observations: Annotated[int, Query(ge=1)] = 20,
) -> WorstStopsResponse:
    sql = """
        SELECT
            stop_id,
            sum(on_time)::bigint      AS on_time,
            sum(late)::bigint         AS late,
            sum(observations)::bigint AS observations,
            sum(delay_sum)::bigint    AS delay_sum
        FROM stop_delay_daily
        WHERE bucket >= :cutoff
          AND (:route_id IS NULL OR route_id = :route_id)
        GROUP BY stop_id
        HAVING sum(observations) >= :min_obs
        ORDER BY (sum(delay_sum)::float / NULLIF(sum(observations), 0)) DESC
        LIMIT :limit
    """
    rows = (await db.execute(
        text(sql).bindparams(
            bindparam("cutoff"), bindparam("route_id", type_=String),
            bindparam("min_obs"), bindparam("limit"),
        ),
        {"cutoff": _cutoff(days), "route_id": route_id,
         "min_obs": min_observations, "limit": limit},
    )).all()

    _, stops_static = load_gtfs_static_data()
    stops = []
    for stop_id, on_time, late, obs, dsum in rows:
        total = obs or 0
        stops.append(WorstStop(
            stop_id=stop_id,
            stop_name=stops_static.get(stop_id, {}).get("stop_name"),
            route_id=route_id,
            observations=int(total),
            on_time_pct=round(100 * (on_time or 0) / total, 1) if total else 0.0,
            avg_delay_seconds=round((dsum or 0) / total, 1) if total else 0.0,
        ))
    return WorstStopsResponse(period_days=days, route_id=route_id, stops=stops)


# ── Service delivery (operated vs scheduled) ────────────────────────────────

@router.get("/service-delivery", response_model=ServiceDeliveryResponse)
async def service_delivery(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
    days: Annotated[int, Query(ge=1, le=90)] = 7,
) -> ServiceDeliveryResponse:
    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(days=days)

    sql = """
        SELECT route_id, count(*)::bigint AS trips
        FROM trip_activity_daily
        WHERE bucket >= :cutoff
          AND (:route_id IS NULL OR route_id = :route_id)
        GROUP BY route_id
    """
    rows = (await db.execute(
        text(sql).bindparams(bindparam("cutoff"), bindparam("route_id", type_=String)),
        {"cutoff": start, "route_id": route_id},
    )).all()

    routes_static, _ = load_gtfs_static_data()
    day_counts = _count_daytypes(start, now)

    results: list[ServiceDeliveryRoute] = []
    total_observed = 0
    total_scheduled = 0
    for rid, observed in rows:
        scheduled = _scheduled_trips(rid, day_counts)
        total_observed += int(observed)
        total_scheduled += scheduled
        results.append(ServiceDeliveryRoute(
            route_id=rid,
            route_short_name=_route_name(routes_static, rid),
            observed_trips=int(observed),
            scheduled_trips=scheduled,
            delivered_pct=round(min(100.0, 100 * observed / scheduled), 1) if scheduled else 0.0,
        ))
    results.sort(key=lambda r: r.delivered_pct)
    return ServiceDeliveryResponse(
        period_days=days,
        observed_trips=total_observed,
        scheduled_trips=total_scheduled,
        delivered_pct=round(min(100.0, 100 * total_observed / total_scheduled), 1) if total_scheduled else 0.0,
        routes=results,
    )


# ── Scheduled frequency (static) ────────────────────────────────────────────

@router.get("/frequency/schedule", response_model=ScheduleFrequencyResponse)
async def schedule_frequency(
    route_id: Annotated[str | None, Query()] = None,
) -> ScheduleFrequencyResponse:
    summary = load_schedule_summary()
    routes_static, _ = load_gtfs_static_data()

    def _to_schema(rid: str, s: dict[str, Any], with_hours: bool) -> ScheduleFrequencyRoute:
        return ScheduleFrequencyRoute(
            route_id=rid,
            route_short_name=_route_name(routes_static, rid),
            weekday_trips=s["weekday_trips"],
            saturday_trips=s["saturday_trips"],
            sunday_trips=s["sunday_trips"],
            span_start=s["service_span"]["start"],
            span_end=s["service_span"]["end"],
            headways_by_hour=(
                [HourHeadway(hour=h, headway_minutes=s["headways_by_hour"].get(h))
                 for h in range(24)] if with_hours else []
            ),
        )

    if route_id:
        s = summary.get(route_id)
        routes = [_to_schema(route_id, s, True)] if s else []
        return ScheduleFrequencyResponse(route_id=route_id, routes=routes)

    routes = [_to_schema(rid, s, False) for rid, s in summary.items() if s["weekday_trips"]]
    routes.sort(key=lambda r: r.route_short_name)
    return ScheduleFrequencyResponse(route_id=None, routes=routes)


# ── Occupancy / crowding ────────────────────────────────────────────────────

_OCC_TOTALS_SQL = """
    SELECT
        count(*) FILTER (WHERE occupancy_status = 'EMPTY')                        AS empty,
        count(*) FILTER (WHERE occupancy_status = 'MANY_SEATS_AVAILABLE')         AS many_seats,
        count(*) FILTER (WHERE occupancy_status = 'FEW_SEATS_AVAILABLE')          AS few_seats,
        count(*) FILTER (WHERE occupancy_status = 'STANDING_ROOM_ONLY')           AS standing,
        count(*) FILTER (WHERE occupancy_status = 'CRUSHED_STANDING_ROOM_ONLY')   AS crushed,
        count(*) FILTER (WHERE occupancy_status = 'FULL')                         AS full,
        count(*) FILTER (WHERE occupancy_status = 'NOT_ACCEPTING_PASSENGERS')     AS not_accepting,
        count(*) FILTER (WHERE occupancy_status IS NULL
                            OR occupancy_status = 'UNKNOWN')                      AS unknown,
        count(*)                                                                   AS samples
    FROM vehicle_positions
    WHERE timestamp >= :cutoff
      AND (:route_id IS NULL OR route_id = :route_id)
"""

_OCC_HOUR_SQL = f"""
    SELECT
        EXTRACT(hour FROM timestamp AT TIME ZONE '{_TZ}')::int AS hour,
        count(*) FILTER (WHERE occupancy_status = 'EMPTY')                        AS empty,
        count(*) FILTER (WHERE occupancy_status = 'MANY_SEATS_AVAILABLE')         AS many_seats,
        count(*) FILTER (WHERE occupancy_status = 'FEW_SEATS_AVAILABLE')          AS few_seats,
        count(*) FILTER (WHERE occupancy_status = 'STANDING_ROOM_ONLY')           AS standing,
        count(*) FILTER (WHERE occupancy_status = 'CRUSHED_STANDING_ROOM_ONLY')   AS crushed,
        count(*) FILTER (WHERE occupancy_status = 'FULL')                         AS full,
        count(*) FILTER (WHERE occupancy_status = 'NOT_ACCEPTING_PASSENGERS')     AS not_accepting,
        count(*) FILTER (WHERE occupancy_status IS NULL
                            OR occupancy_status = 'UNKNOWN')                      AS unknown,
        count(*)                                                                   AS total
    FROM vehicle_positions
    WHERE timestamp >= :cutoff
      AND (:route_id IS NULL OR route_id = :route_id)
    GROUP BY hour
    ORDER BY hour
"""


def _occ_trip_ids(route_id: str | None, direction: int | None) -> list[str] | None:
    """Return trip_id list for a direction filter, or None when no filter needed."""
    if route_id is None or direction is None:
        return None
    dir_info = load_route_direction_info().get(route_id, {})
    entry = dir_info.get(str(direction))
    return entry["trip_ids"] if entry else []


@router.get("/occupancy", response_model=OccupancyResponse)
async def occupancy(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
    days: Annotated[int, Query(ge=1, le=90)] = 7,
    direction: Annotated[int | None, Query(ge=0, le=1)] = None,
) -> OccupancyResponse:
    cutoff = _cutoff(days)
    trip_ids = _occ_trip_ids(route_id, direction)

    # Build direction info for the route regardless of direction filter
    directions: list[DirectionInfo] = []
    if route_id:
        dir_info = load_route_direction_info().get(route_id, {})
        for did_str, info in sorted(dir_info.items()):
            try:
                directions.append(DirectionInfo(
                    direction_id=int(did_str), headsign=info["headsign"]
                ))
            except (ValueError, KeyError):
                pass

    # If direction was specified but no trips found, return empty response
    if trip_ids is not None and len(trip_ids) == 0:
        return OccupancyResponse(
            period_days=days, route_id=route_id, direction=direction,
            reported=False, directions=directions,
        )

    use_trip_filter = trip_ids is not None

    def _add_trip_filter(sql: str) -> str:
        if not use_trip_filter:
            return sql
        return sql + "\n      AND trip_id = ANY(:trip_ids)"

    params_base: dict[str, Any] = {"cutoff": cutoff, "route_id": route_id}
    trip_bp = [bindparam("trip_ids", type_=ARRAY(String))] if use_trip_filter else []
    if use_trip_filter:
        params_base["trip_ids"] = trip_ids

    totals_sql = _add_trip_filter(_OCC_TOTALS_SQL)
    row = (await db.execute(
        text(totals_sql).bindparams(
            bindparam("cutoff"), bindparam("route_id", type_=String), *trip_bp,
        ),
        params_base,
    )).one()

    (empty, many_seats, few_seats, standing, crushed, full_cnt,
     not_accepting, unknown, samples) = (int(v or 0) for v in row)

    low = empty + many_seats
    medium = few_seats
    high = standing + crushed + full_cnt + not_accepting
    total_known = low + medium + high

    hour_sql = _add_trip_filter(_OCC_HOUR_SQL)
    hour_rows = (await db.execute(
        text(hour_sql).bindparams(
            bindparam("cutoff"), bindparam("route_id", type_=String), *trip_bp,
        ),
        params_base,
    )).all()

    by_hour = []
    for hr_row in hour_rows:
        (h, e, ms, fs, st, cr, fl, na, unk, tot) = (
            int(hr_row[i] or 0) for i in range(10)
        )
        hr_total = e + ms + fs + st + cr + fl + na
        if hr_total == 0:
            continue
        by_hour.append(OccupancyHourPoint(
            hour=h,
            empty=e, many_seats=ms, few_seats=fs,
            standing=st, crushed=cr, full=fl, not_accepting=na,
            unknown=unk, total=tot,
        ))

    standing_pct = round(100 * high / total_known, 1) if total_known else None

    return OccupancyResponse(
        period_days=days,
        route_id=route_id,
        direction=direction,
        reported=total_known > 0,
        empty=empty, many_seats=many_seats, few_seats=few_seats,
        standing=standing, crushed=crushed, full=full_cnt,
        not_accepting=not_accepting,
        low=low, medium=medium, high=high,
        unknown=unknown, samples=samples,
        standing_pct=standing_pct,
        by_hour=by_hour,
        directions=directions,
    )


# ── Ridership ───────────────────────────────────────────────────────────────

async def _latest_ridership(db: AsyncSession, route_id: str | None) -> tuple[str | None, int | None, int | None]:
    """Return (latest_month_iso, latest_total, prev_total) for system or route."""
    stmt = select(RidershipMonthly.month, RidershipMonthly.boardings)
    if route_id:
        stmt = stmt.where(RidershipMonthly.route_id == route_id)
    rows = (await db.execute(stmt)).all()
    if not rows:
        return None, None, None
    by_month: dict[Any, int] = {}
    for month, boardings in rows:
        by_month[month] = by_month.get(month, 0) + (boardings or 0)
    months = sorted(by_month.keys())
    latest = months[-1]
    prev = months[-2] if len(months) > 1 else None
    return latest.isoformat(), by_month[latest], (by_month[prev] if prev else None)


@router.get("/ridership", response_model=RidershipResponse)
async def ridership(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
    months: Annotated[int, Query(ge=1, le=60)] = 24,
) -> RidershipResponse:
    routes_static, _ = load_gtfs_static_data()

    # Series (system total or single route) by month.
    stmt = select(RidershipMonthly.month, RidershipMonthly.boardings)
    if route_id:
        stmt = stmt.where(RidershipMonthly.route_id == route_id)
    rows = (await db.execute(stmt)).all()
    if not rows:
        return RidershipResponse(route_id=route_id, available=False, series=[], by_route_latest=[])

    by_month: dict[Any, int] = {}
    for month, boardings in rows:
        by_month[month] = by_month.get(month, 0) + (boardings or 0)
    ordered = sorted(by_month.keys())[-months:]
    series = [RidershipPoint(month=m.isoformat(), boardings=by_month[m]) for m in ordered]

    # Latest-month boardings per route (system view only).
    by_route_latest: list[RidershipRoute] = []
    latest_month = sorted(by_month.keys())[-1]
    latest_rows = (await db.execute(
        select(RidershipMonthly.route_id, RidershipMonthly.boardings)
        .where(RidershipMonthly.month == latest_month)
    )).all()
    for rid, boardings in latest_rows:
        by_route_latest.append(RidershipRoute(
            route_id=rid, route_short_name=_route_name(routes_static, rid),
            boardings=boardings or 0,
        ))
    by_route_latest.sort(key=lambda r: r.boardings, reverse=True)

    latest, latest_total, prev_total = await _latest_ridership(db, route_id)
    return RidershipResponse(
        route_id=route_id, available=True,
        latest_month=latest, latest_total=latest_total, prev_total=prev_total,
        series=series, by_route_latest=by_route_latest,
    )

"""On-time performance, frequency, and stuck-vehicle alert endpoints."""
from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, bindparam, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.database import get_db
from app.models.vehicle_position import VehiclePosition
from app.schemas.stats import (
    AlertsResponse,
    FrequencyResponse,
    FrequencyRouteStats,
    OnTimeResponse,
    OnTimeRouteStats,
    OverallOnTime,
    StuckAlert,
)
from app.services.gtfs_decoder import load_gtfs_static_data
from app.config import get_settings

router = APIRouter(prefix="/stats", tags=["stats"])

# On-time classification thresholds (>5 min late, <1 min early) now live in the
# trip_ontime_hourly continuous aggregate (migration 002); changing them there
# requires re-refreshing the aggregate.


# ── On-time performance ────────────────────────────────────────────────────

# Aggregate the pre-computed hourly buckets (trip_ontime_hourly, migration 002)
# down to per-route totals over the requested window. This reads a few hundred
# rollup rows instead of millions of raw trip_updates rows.
_ONTIME_SQL = """
    SELECT
        route_id,
        sum(on_time)::bigint     AS on_time,
        sum(late)::bigint        AS late,
        sum(early)::bigint       AS early,
        sum(observations)::bigint AS observations,
        sum(delay_sum)::bigint   AS delay_sum
    FROM trip_ontime_hourly
    WHERE bucket >= :cutoff
      AND (:route_id IS NULL OR route_id = :route_id)
    GROUP BY route_id
"""


@router.get("/ontime", response_model=OnTimeResponse)
async def ontime_performance(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
    days: Annotated[int, Query(ge=1, le=90)] = 7,
) -> OnTimeResponse:
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)

    result = await db.execute(
        text(_ONTIME_SQL).bindparams(
            bindparam("cutoff"),
            bindparam("route_id", type_=String),
        ),
        {"cutoff": cutoff, "route_id": route_id},
    )
    rows = result.all()

    routes_static, _ = load_gtfs_static_data()

    route_stats: list[OnTimeRouteStats] = []
    total_on_time = 0
    total_obs = 0
    total_delay_sum = 0
    for rid, on_time, late, early, observations, delay_sum in sorted(rows):
        total = (on_time or 0) + (late or 0) + (early or 0)
        pct = round(100 * (on_time or 0) / total, 1) if total else 0.0
        avg_delay = round((delay_sum or 0) / observations, 1) if observations else 0.0
        total_on_time += on_time or 0
        total_obs += observations or 0
        total_delay_sum += delay_sum or 0
        route_stats.append(
            OnTimeRouteStats(
                route_id=rid,
                route_short_name=routes_static.get(rid, {}).get("route_short_name", rid),
                total_observations=total,
                on_time=on_time or 0,
                late=late or 0,
                early=early or 0,
                on_time_pct=pct,
                avg_delay_seconds=avg_delay,
            )
        )

    overall_pct = round(100 * total_on_time / total_obs, 1) if total_obs else 0.0
    overall_avg = round(total_delay_sum / total_obs, 1) if total_obs else 0.0

    return OnTimeResponse(
        period_days=days,
        routes=route_stats,
        overall=OverallOnTime(on_time_pct=overall_pct, avg_delay_seconds=overall_avg),
    )


# ── Frequency ──────────────────────────────────────────────────────────────

# Estimated round-trip cycle time per GTFS route_type (minutes).
# headway ≈ cycle_time / active_vehicle_count  (e.g. 10 buses on 90-min loop → 9 min)
_ROUTE_CYCLE_MINUTES: dict[str, float] = {
    "0": 45.0,   # light rail
    "1": 30.0,   # heavy rail / subway
    "2": 120.0,  # commuter rail
    "3": 90.0,   # bus (default)
}


@router.get("/frequency", response_model=FrequencyResponse)
async def frequency_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
) -> FrequencyResponse:
    """Estimate current headway per route from live vehicle position counts.

    Groups the last 30 minutes of positions into 5-minute buckets and counts
    distinct vehicles per bucket.  Headway = cycle_time / vehicle_count using
    route-type-aware cycle times.  Min / max reflect real variation across
    buckets (peak vs. off-peak within the window).
    """
    cutoff = datetime.now(tz=timezone.utc) - timedelta(minutes=30)

    # Count distinct active vehicles per route per 5-minute bucket.
    # Integer division bucketing avoids modulo-operator escaping issues.
    _BUCKET_SQL = """
        SELECT
            route_id,
            COUNT(DISTINCT COALESCE(vehicle_id, trip_id)) AS cnt
        FROM vehicle_positions
        WHERE timestamp >= :cutoff
          AND (:route_id IS NULL OR route_id = :route_id)
        GROUP BY
            route_id,
            date_trunc('hour', timestamp)
                + (EXTRACT(minute FROM timestamp)::int / 5) * 5 * INTERVAL '1 minute'
    """
    result = await db.execute(
        text(_BUCKET_SQL).bindparams(
            bindparam("cutoff"),
            bindparam("route_id", type_=String),
        ),
        {"cutoff": cutoff, "route_id": route_id},
    )
    bucket_rows = result.all()

    # Aggregate bucket counts per route
    route_buckets: dict[str, list[int]] = defaultdict(list)
    for rid, cnt in bucket_rows:
        route_buckets[rid].append(int(cnt))

    routes_static, _ = load_gtfs_static_data()

    freq_stats: list[FrequencyRouteStats] = []
    for rid, counts in sorted(route_buckets.items()):
        route_info = routes_static.get(rid, {})
        cycle = _ROUTE_CYCLE_MINUTES.get(route_info.get("route_type", "3"), 90.0)

        max_count = max(counts)
        if max_count >= 2:
            avg_count = sum(counts) / len(counts)
            avg_hw = round(cycle / avg_count, 1)
            # More vehicles active = shorter (better) headway; fewer = longer
            min_hw = round(cycle / max_count, 1)
            max_hw = round(cycle / max(1, min(counts)), 1)
        else:
            avg_hw = min_hw = max_hw = 0.0

        freq_stats.append(
            FrequencyRouteStats(
                route_id=rid,
                route_short_name=route_info.get("route_short_name", rid),
                avg_headway_minutes=avg_hw,
                min_headway_minutes=min_hw,
                max_headway_minutes=max_hw,
                vehicle_count=max_count,
            )
        )

    return FrequencyResponse(
        computed_at=datetime.now(tz=timezone.utc),
        routes=freq_stats,
    )


# ── Stuck-vehicle alerts ───────────────────────────────────────────────────

# Stuck-alert detection scans a 15-min window and is polled every 30s by every
# client; cache the assembled response briefly so concurrent tabs share one scan.
_ALERTS_CACHE_TTL_SECONDS = 10.0
_alerts_cache: tuple[float, AlertsResponse] | None = None


@router.get("/alerts", response_model=AlertsResponse)
async def stuck_vehicle_alerts(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AlertsResponse:
    global _alerts_cache
    mono = time.monotonic()
    if _alerts_cache is not None and mono - _alerts_cache[0] < _ALERTS_CACHE_TTL_SECONDS:
        return _alerts_cache[1]

    settings = get_settings()
    threshold = timedelta(minutes=settings.stuck_vehicle_minutes)
    window = threshold * 3  # look back far enough to check for movement

    cutoff = datetime.now(tz=timezone.utc) - window

    stmt = (
        select(VehiclePosition)
        .options(
            load_only(
                VehiclePosition.vehicle_id,
                VehiclePosition.vehicle_label,
                VehiclePosition.trip_id,
                VehiclePosition.route_id,
                VehiclePosition.latitude,
                VehiclePosition.longitude,
                VehiclePosition.current_status,
                VehiclePosition.stop_id,
                VehiclePosition.timestamp,
            )
        )
        .where(VehiclePosition.timestamp >= cutoff)
        .order_by(VehiclePosition.vehicle_id, VehiclePosition.timestamp.desc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    # Group by vehicle key (prefer vehicle_id, fall back to trip_id)
    veh_rows: dict[str, list[VehiclePosition]] = defaultdict(list)
    for r in rows:
        veh_rows[r.vehicle_id or r.trip_id or ""].append(r)

    routes_static, stops_static = load_gtfs_static_data()

    now = datetime.now(tz=timezone.utc)
    alerts: list[StuckAlert] = []

    for vid, history in veh_rows.items():
        if len(history) < 2:
            continue
        latest = history[0]
        lat0, lon0 = latest.latitude, latest.longitude
        earliest_same_pos = latest.timestamp

        # Walk backwards (history is already ordered newest-first) and collect
        # the consecutive streak of rows at the same position.
        streak: list[VehiclePosition] = [latest]
        for prev in history[1:]:
            if _positions_equal(lat0, lon0, prev.latitude, prev.longitude):
                earliest_same_pos = prev.timestamp
                streak.append(prev)
            else:
                break  # vehicle moved at some point in history

        stationary_duration = now - earliest_same_pos
        if stationary_duration < threshold:
            continue

        # Skip vehicles whose entire stuck streak shows STOPPED_AT (status 1).
        # These are legitimate terminal/layover dwells — the vehicle is
        # intentionally parked, not broken down or stuck in traffic.
        streak_statuses = {r.current_status for r in streak if r.current_status is not None}
        if streak_statuses and streak_statuses <= {1}:
            continue

        stop_info = stops_static.get(latest.stop_id or "", {})
        route_info = routes_static.get(latest.route_id, {})
        alerts.append(
            StuckAlert(
                vehicle_id=latest.vehicle_id,
                vehicle_label=latest.vehicle_label,
                route_id=latest.route_id,
                route_short_name=route_info.get("route_short_name", latest.route_id),
                latitude=latest.latitude,
                longitude=latest.longitude,
                stop_id=latest.stop_id,
                stop_name=stop_info.get("stop_name"),
                stuck_since=earliest_same_pos,
                minutes_stuck=round(stationary_duration.total_seconds() / 60, 1),
            )
        )

    response = AlertsResponse(computed_at=now, alerts=alerts)
    _alerts_cache = (mono, response)
    return response


def _positions_equal(
    lat1: float | None,
    lon1: float | None,
    lat2: float | None,
    lon2: float | None,
    tolerance: float = 0.0002,
) -> bool:
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return False
    return abs(lat1 - lat2) < tolerance and abs(lon1 - lon2) < tolerance

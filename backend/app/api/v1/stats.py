"""On-time performance, frequency, and stuck-vehicle alert endpoints."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, bindparam, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vehicle_position import VehiclePosition
from app.models.trip_update import TripUpdate
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

_LATE_THRESHOLD_SEC = 300   # >5 min = late
_EARLY_THRESHOLD_SEC = -60  # <-1 min = early


# ── On-time performance ────────────────────────────────────────────────────

@router.get("/ontime", response_model=OnTimeResponse)
async def ontime_performance(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
    days: Annotated[int, Query(ge=1, le=90)] = 7,
) -> OnTimeResponse:
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)

    stmt = select(
        TripUpdate.route_id,
        TripUpdate.arrival_delay,
    ).where(
        TripUpdate.timestamp >= cutoff,
        TripUpdate.arrival_delay.is_not(None),
    )
    if route_id:
        stmt = stmt.where(TripUpdate.route_id == route_id)

    result = await db.execute(stmt)
    rows = result.all()

    # Aggregate per route
    buckets: dict[str, dict] = defaultdict(lambda: {"on_time": 0, "late": 0, "early": 0, "delays": []})
    for rid, delay in rows:
        b = buckets[rid]
        b["delays"].append(delay)
        if delay > _LATE_THRESHOLD_SEC:
            b["late"] += 1
        elif delay < _EARLY_THRESHOLD_SEC:
            b["early"] += 1
        else:
            b["on_time"] += 1

    routes_static, _ = load_gtfs_static_data()

    route_stats: list[OnTimeRouteStats] = []
    for rid, b in sorted(buckets.items()):
        total = b["on_time"] + b["late"] + b["early"]
        pct = round(100 * b["on_time"] / total, 1) if total else 0.0
        avg_delay = round(sum(b["delays"]) / len(b["delays"]), 1) if b["delays"] else 0.0
        route_stats.append(
            OnTimeRouteStats(
                route_id=rid,
                route_short_name=routes_static.get(rid, {}).get("route_short_name", rid),
                total_observations=total,
                on_time=b["on_time"],
                late=b["late"],
                early=b["early"],
                on_time_pct=pct,
                avg_delay_seconds=avg_delay,
            )
        )

    all_delays = [d for b in buckets.values() for d in b["delays"]]
    overall_pct = (
        round(100 * sum(1 for d in all_delays if _EARLY_THRESHOLD_SEC <= d <= _LATE_THRESHOLD_SEC) / len(all_delays), 1)
        if all_delays
        else 0.0
    )
    overall_avg = round(sum(all_delays) / len(all_delays), 1) if all_delays else 0.0

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

@router.get("/alerts", response_model=AlertsResponse)
async def stuck_vehicle_alerts(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AlertsResponse:
    settings = get_settings()
    threshold = timedelta(minutes=settings.stuck_vehicle_minutes)
    window = threshold * 3  # look back far enough to check for movement

    cutoff = datetime.now(tz=timezone.utc) - window

    stmt = (
        select(VehiclePosition)
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

    return AlertsResponse(computed_at=now, alerts=alerts)


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

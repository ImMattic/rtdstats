"""On-time performance, frequency, and stuck-vehicle alert endpoints."""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
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

@router.get("/frequency", response_model=FrequencyResponse)
async def frequency_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query()] = None,
) -> FrequencyResponse:
    """Estimate current headway per route from live vehicle positions."""
    cutoff = datetime.now(tz=timezone.utc) - timedelta(minutes=2)

    stmt = select(
        VehiclePosition.route_id,
        VehiclePosition.vehicle_id,
        func.max(VehiclePosition.timestamp).label("last_seen"),
    ).where(
        VehiclePosition.timestamp >= cutoff,
    ).group_by(
        VehiclePosition.route_id,
        VehiclePosition.vehicle_id,
    )
    if route_id:
        stmt = stmt.where(VehiclePosition.route_id == route_id)

    result = await db.execute(stmt)
    rows = result.all()

    routes_static, _ = load_gtfs_static_data()

    # Group by route
    route_ts: dict[str, list[datetime]] = defaultdict(list)
    for rid, _vid, last_seen in rows:
        route_ts[rid].append(last_seen)

    freq_stats: list[FrequencyRouteStats] = []
    for rid, timestamps in sorted(route_ts.items()):
        n = len(timestamps)
        if n < 2:
            avg_hw = min_hw = max_hw = 0.0
        else:
            sorted_ts = sorted(timestamps)
            gaps = [
                (sorted_ts[i + 1] - sorted_ts[i]).total_seconds() / 60
                for i in range(len(sorted_ts) - 1)
            ]
            avg_hw = round(sum(gaps) / len(gaps), 1)
            min_hw = round(min(gaps), 1)
            max_hw = round(max(gaps), 1)

        freq_stats.append(
            FrequencyRouteStats(
                route_id=rid,
                route_short_name=routes_static.get(rid, {}).get("route_short_name", rid),
                avg_headway_minutes=avg_hw,
                min_headway_minutes=min_hw,
                max_headway_minutes=max_hw,
                vehicle_count=n,
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
    from app.config import get_settings
    from app.services.ingestion import _stops_cache
    from app.services.gtfs_decoder import load_gtfs_static_data as _load

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

    # Group by vehicle_id
    veh_rows: dict[str, list[VehiclePosition]] = defaultdict(list)
    for r in rows:
        veh_rows[r.vehicle_id or r.trip_id or ""].append(r)

    routes_static, stops_static = _load()

    now = datetime.now(tz=timezone.utc)
    alerts: list[StuckAlert] = []

    for vid, history in veh_rows.items():
        if len(history) < 2:
            continue
        latest = history[0]
        # Check if any position in history shows movement
        lat0, lon0 = latest.latitude, latest.longitude
        earliest_same_pos = latest.timestamp

        for prev in history[1:]:
            if _positions_equal(lat0, lon0, prev.latitude, prev.longitude):
                earliest_same_pos = prev.timestamp
            else:
                break  # vehicle moved at some point in history

        stationary_duration = now - earliest_same_pos
        if stationary_duration >= threshold:
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

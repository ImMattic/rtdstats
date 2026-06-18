"""Historical vehicle position query endpoint."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vehicle_position import VehiclePosition
from app.models.trip_update import TripUpdate
from app.schemas.vehicle_position import VehiclePositionHistoryOut
from app.services.gtfs_decoder import load_gtfs_static_data

router = APIRouter(prefix="/historical", tags=["historical"])


@router.get("/vehicles", response_model=dict)
async def get_historical_vehicles(
    db: Annotated[AsyncSession, Depends(get_db)],
    route_id: Annotated[str | None, Query(description="Filter by route ID")] = None,
    start: Annotated[
        datetime | None,
        Query(description="Start timestamp (ISO 8601, default: 24 h ago)"),
    ] = None,
    end: Annotated[
        datetime | None,
        Query(description="End timestamp (ISO 8601, default: now)"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=10_000)] = 200,
    page: Annotated[int, Query(ge=1)] = 1,
) -> dict:
    now = datetime.now(tz=timezone.utc)
    start = start or (now - timedelta(hours=24))
    end = end or now
    offset = (page - 1) * limit

    stmt = (
        select(VehiclePosition)
        .where(
            VehiclePosition.timestamp >= start,
            VehiclePosition.timestamp <= end,
        )
        .order_by(VehiclePosition.timestamp.desc())
        .offset(offset)
        .limit(limit)
    )
    if route_id:
        stmt = stmt.where(VehiclePosition.route_id == route_id)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    # Enrich with static route names and most-recent delays
    routes_static, _ = load_gtfs_static_data()
    delay_map = await _delay_map(db, start, end, route_id)

    vehicles = [
        VehiclePositionHistoryOut(
            vehicle_id=r.vehicle_id,
            vehicle_label=r.vehicle_label,
            trip_id=r.trip_id,
            route_id=r.route_id,
            route_short_name=routes_static.get(r.route_id, {}).get("route_short_name"),
            latitude=r.latitude,
            longitude=r.longitude,
            bearing=r.bearing,
            current_status=r.current_status,
            stop_id=r.stop_id,
            occupancy_status=r.occupancy_status,
            timestamp=r.timestamp,
            delay_seconds=delay_map.get(r.trip_id or ""),
        )
        for r in rows
    ]

    count_stmt = select(func.count()).select_from(VehiclePosition).where(
        VehiclePosition.timestamp >= start,
        VehiclePosition.timestamp <= end,
    )
    if route_id:
        count_stmt = count_stmt.where(VehiclePosition.route_id == route_id)
    total = int((await db.execute(count_stmt)).scalar_one())
    total_pages = (total + limit - 1) // limit if total else 0

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "page": page,
        "limit": limit,
        "returned": len(vehicles),
        "total": total,
        "total_pages": total_pages,
        "vehicles": [v.model_dump() for v in vehicles],
    }


async def _delay_map(
    db: AsyncSession,
    start: datetime,
    end: datetime,
    route_id: str | None,
) -> dict[str, int]:
    """Return the most-recent non-null arrival_delay (seconds) keyed by trip_id."""
    # Subquery: find the latest timestamp per trip_id that has a delay value
    subq = (
        select(
            TripUpdate.trip_id,
            func.max(TripUpdate.timestamp).label("max_ts"),
        )
        .where(
            TripUpdate.timestamp >= start,
            TripUpdate.timestamp <= end,
            TripUpdate.arrival_delay.is_not(None),
        )
        .group_by(TripUpdate.trip_id)
        .subquery()
    )
    stmt = select(TripUpdate.trip_id, TripUpdate.arrival_delay).join(
        subq,
        (TripUpdate.trip_id == subq.c.trip_id) & (TripUpdate.timestamp == subq.c.max_ts),
    )
    if route_id:
        stmt = stmt.where(TripUpdate.route_id == route_id)

    result = await db.execute(stmt)
    return {
        trip_id: delay
        for trip_id, delay in result.all()
        if trip_id is not None
    }

"""Historical vehicle position query endpoint."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vehicle_position import VehiclePosition
from app.models.trip_update import TripUpdate
from app.schemas.vehicle_position import VehiclePositionHistoryOut

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
    limit: Annotated[int, Query(ge=1, le=10_000)] = 1_000,
) -> dict:
    now = datetime.now(tz=timezone.utc)
    start = start or (now - timedelta(hours=24))
    end = end or now

    stmt = (
        select(VehiclePosition)
        .where(
            VehiclePosition.timestamp >= start,
            VehiclePosition.timestamp <= end,
        )
        .order_by(VehiclePosition.timestamp.desc())
        .limit(limit)
    )
    if route_id:
        stmt = stmt.where(VehiclePosition.route_id == route_id)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    # Pair up with delays via a second query (best-effort)
    delay_map = await _delay_map(db, start, end, route_id)

    vehicles = [
        VehiclePositionHistoryOut(
            vehicle_id=r.vehicle_id,
            vehicle_label=r.vehicle_label,
            trip_id=r.trip_id,
            route_id=r.route_id,
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

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "returned": len(vehicles),
        "vehicles": [v.model_dump() for v in vehicles],
    }


async def _delay_map(
    db: AsyncSession,
    start: datetime,
    end: datetime,
    route_id: str | None,
) -> dict[str, int]:
    stmt = (
        select(TripUpdate.trip_id, TripUpdate.arrival_delay)
        .where(
            TripUpdate.timestamp >= start,
            TripUpdate.timestamp <= end,
            TripUpdate.arrival_delay.is_not(None),
        )
    )
    if route_id:
        stmt = stmt.where(TripUpdate.route_id == route_id)

    result = await db.execute(stmt)
    delay_map: dict[str, int] = {}
    for trip_id, delay in result.all():
        if trip_id and trip_id not in delay_map:
            delay_map[trip_id] = delay
    return delay_map

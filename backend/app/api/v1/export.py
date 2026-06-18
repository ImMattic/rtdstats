"""Data export endpoint – download vehicle history as CSV or JSON."""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vehicle_position import VehiclePosition

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/vehicles")
async def export_vehicles(
    db: Annotated[AsyncSession, Depends(get_db)],
    fmt: Annotated[str, Query(alias="format", pattern="^(csv|json)$")] = "json",
    route_id: Annotated[str | None, Query()] = None,
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50_000)] = 5_000,
) -> Response:
    now = datetime.now(tz=timezone.utc)
    start = start or (now - timedelta(days=7))
    end = end or now

    stmt = (
        select(VehiclePosition)
        .where(
            VehiclePosition.timestamp >= start,
            VehiclePosition.timestamp <= end,
        )
        .order_by(VehiclePosition.timestamp.asc())
        .limit(limit)
    )
    if route_id:
        stmt = stmt.where(VehiclePosition.route_id == route_id)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    if fmt == "csv":
        return _csv_response(rows)
    return _json_response(rows)


def _row_to_dict(r: VehiclePosition) -> dict:
    return {
        "vehicle_id": r.vehicle_id,
        "vehicle_label": r.vehicle_label,
        "trip_id": r.trip_id,
        "route_id": r.route_id,
        "latitude": r.latitude,
        "longitude": r.longitude,
        "bearing": r.bearing,
        "current_stop_sequence": r.current_stop_sequence,
        "current_status": r.current_status,
        "stop_id": r.stop_id,
        "occupancy_status": r.occupancy_status,
        "timestamp": r.timestamp.isoformat(),
    }


def _csv_response(rows: list[VehiclePosition]) -> StreamingResponse:
    buf = io.StringIO()
    fieldnames = list(_row_to_dict(rows[0]).keys()) if rows else []
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for r in rows:
        writer.writerow(_row_to_dict(r))
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="vehicle_positions.csv"'},
    )


def _json_response(rows: list[VehiclePosition]) -> Response:
    payload = json.dumps([_row_to_dict(r) for r in rows], default=str)
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="vehicle_positions.json"'},
    )

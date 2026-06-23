#!/usr/bin/env python
"""Backfill observed on-time arrivals from already-stored vehicle positions.

The on-time rework (migration 004) derives arrivals by geofencing live
``vehicle_positions`` against the static timepoint schedule.  Going forward the
ingest loop does this, but the dashboards would start empty.  This script
replays every stored position through the same ``classify_arrival`` logic so the
new ``stop_arrival_events`` table — and the on-time continuous aggregates built
on it — have history immediately.

It is idempotent: it wipes ``stop_arrival_events`` and rebuilds from scratch,
processing positions oldest-first so the earliest snapshot near a timepoint wins
(de-duplicated per trip/stop/service-date in memory).  Finally it refreshes the
on-time continuous aggregates.

Run inside the backend container or venv:

    python -m scripts.backfill_ontime
    python -m scripts.backfill_ontime --batch-size 20000
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date
from pathlib import Path

# Allow running as `python backend/scripts/backfill_ontime.py` too.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import insert, select, text  # noqa: E402

from app.database import AsyncSessionLocal, engine  # noqa: E402
from app.models.stop_arrival import StopArrivalEvent  # noqa: E402
from app.models.vehicle_position import VehiclePosition  # noqa: E402
from app.services.gtfs_schedule import load_trip_shape_dist_schedule  # noqa: E402
from app.services.ontime import classify_arrival  # noqa: E402

_VP = VehiclePosition


async def _wipe() -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(text("TRUNCATE TABLE stop_arrival_events;"))


async def _backfill(batch_size: int) -> int:
    schedule = load_trip_shape_dist_schedule()
    if not schedule:
        raise SystemExit("No timepoint schedule loaded — is gtfs-static present?")

    seen: set[tuple[str, int, date]] = set()
    total = 0
    # Keyset pagination on (timestamp, id) — cheap over a hypertable and stable.
    last_ts = None
    last_id = -1

    async with AsyncSessionLocal() as session:
        while True:
            stmt = (
                select(
                    _VP.trip_id, _VP.route_id, _VP.latitude, _VP.longitude,
                    _VP.bearing, _VP.current_status, _VP.current_stop_sequence,
                    _VP.timestamp, _VP.id,
                )
                .order_by(_VP.timestamp, _VP.id)
                .limit(batch_size)
            )
            if last_ts is not None:
                stmt = stmt.where(
                    (_VP.timestamp > last_ts)
                    | ((_VP.timestamp == last_ts) & (_VP.id > last_id))
                )
            rows = (await session.execute(stmt)).all()
            if not rows:
                break

            events: list[dict] = []
            for trip_id, route_id, lat, lon, bearing, cur_status, cur_stop_seq, ts, vp_id in rows:
                last_ts, last_id = ts, vp_id
                event = classify_arrival(
                    {
                        "trip_id": trip_id, "route_id": route_id,
                        "latitude": lat, "longitude": lon,
                        "bearing": bearing,
                        "current_status": cur_status,
                        "current_stop_sequence": cur_stop_seq,
                    },
                    schedule,
                    ts,
                )
                if event is None:
                    continue
                key = (event["trip_id"], event["stop_sequence"], event["service_date"])
                if key in seen:
                    continue
                seen.add(key)
                events.append(event)

            if events:
                async with AsyncSessionLocal() as writer:
                    async with writer.begin():
                        await writer.execute(insert(StopArrivalEvent), events)
                total += len(events)

            print(f"  …processed up to {last_ts}: {total} arrivals so far", flush=True)
            if len(rows) < batch_size:
                break

    return total


async def _refresh_caggs() -> None:
    # refresh_continuous_aggregate() can't run inside a transaction.
    async with engine.connect() as conn:
        conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
        for name in ("trip_ontime_hourly", "stop_delay_daily"):
            await conn.execute(
                text(f"CALL refresh_continuous_aggregate('{name}', NULL, NULL);")
            )


async def _run(batch_size: int) -> None:
    print("Wiping stop_arrival_events …")
    await _wipe()
    print("Replaying vehicle positions …")
    total = await _backfill(batch_size)
    print(f"Inserted {total} arrival events. Refreshing aggregates …")
    await _refresh_caggs()
    print("Done.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, default=20000)
    args = parser.parse_args()
    asyncio.run(_run(args.batch_size))


if __name__ == "__main__":
    main()

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
(de-duplicated per trip/stop/service-date in memory).  Trip origins are timed by
departure rather than arrival, which needs positions in time order — the keyset
scan below already guarantees that, and one ``OriginDepartureTracker`` spans all
batches so a layover straddling a batch boundary still resolves.  Finally it
refreshes the on-time continuous aggregates.

Re-run this after changing the origin-departure logic or radius: rows written by
the previous rules are not rewritten in place.

Run inside the backend container:

    docker compose exec backend python scripts/backfill_ontime.py
    docker compose exec backend python scripts/backfill_ontime.py --batch-size 20000

Or from a local venv. The ``-m`` form requires your shell's cwd to be
``backend/`` (it's a plain package lookup, so run from anywhere else — e.g.
the repo root — and you'll get ``ModuleNotFoundError: No module named
'scripts'``):

    cd backend && python -m scripts.backfill_ontime

Running it as a script instead sidesteps that — it self-adds ``backend/`` to
sys.path, so this works from the repo root too (and picks up the root
``.env`` for DATABASE_URL, matching how the app itself resolves settings):

    python backend/scripts/backfill_ontime.py

Long replays can exceed the API's server-side query timeout; disable it for
this process with STATEMENT_TIMEOUT_MS=0.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, datetime, timezone
from pathlib import Path

# Allow running as `python backend/scripts/backfill_ontime.py` too.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import insert, select, text  # noqa: E402

from app.database import AsyncSessionLocal, engine  # noqa: E402
from app.models.stop_arrival import StopArrivalEvent  # noqa: E402
from app.models.vehicle_position import VehiclePosition  # noqa: E402
from app.services.gtfs_schedule import (  # noqa: E402
    load_trip_origin_timepoints,
    load_trip_shape_dist_schedule,
)
from app.services.ontime import (  # noqa: E402
    OriginDepartureTracker,
    classify_arrival,
    classify_segment_arrivals,
)

_VP = VehiclePosition


async def _wipe() -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(text("TRUNCATE TABLE stop_arrival_events;"))


def _dedupe(candidates: list[dict], seen: set[tuple[str, int, date]]) -> list[dict]:
    """Keep the first event per (trip, stop, service date); ``seen`` is mutated."""
    out: list[dict] = []
    for event in candidates:
        key = (event["trip_id"], event["stop_sequence"], event["service_date"])
        if key in seen:
            continue
        seen.add(key)
        out.append(event)
    return out


async def _backfill(batch_size: int) -> int:
    schedule = load_trip_shape_dist_schedule()
    if not schedule:
        raise SystemExit("No timepoint schedule loaded — is gtfs-static present?")

    origins = load_trip_origin_timepoints()
    tracker = OriginDepartureTracker(origins)

    seen: set[tuple[str, int, date]] = set()
    # Each trip's previous fix, carried across batches so a stop passed
    # over a batch boundary is still interpolated.
    last_fix: dict[str, tuple[dict, datetime]] = {}
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

            candidates: list[dict] = []
            for trip_id, route_id, lat, lon, bearing, cur_status, cur_stop_seq, ts, vp_id in rows:
                last_ts, last_id = ts, vp_id
                vp_row = {
                    "trip_id": trip_id, "route_id": route_id,
                    "latitude": lat, "longitude": lon,
                    "bearing": bearing,
                    "current_status": cur_status,
                    "current_stop_sequence": cur_stop_seq,
                }
                departure = tracker.feed(vp_row, ts)
                if departure is not None:
                    candidates.append(departure)
                origin = origins.get(trip_id or "")
                skip_sequence = origin[0] if origin else None

                # Stops passed between this fix and the trip's previous one.
                # The keyset scan is in timestamp order and last_fix spans
                # batches, so this matches the live loop exactly. Listed first
                # so an interpolated crossing time beats the point match in
                # _dedupe.
                previous = last_fix.get(trip_id) if trip_id else None
                if previous is not None:
                    candidates.extend(
                        classify_segment_arrivals(
                            previous[0], previous[1], vp_row, ts, schedule,
                            skip_sequence=skip_sequence,
                        )
                    )
                if trip_id:
                    last_fix[trip_id] = (vp_row, ts)

                arrival = classify_arrival(
                    vp_row,
                    schedule,
                    ts,
                    skip_sequence=skip_sequence,
                )
                if arrival is not None:
                    candidates.append(arrival)

            # Trips that went quiet at their origin: resolve against this batch's
            # watermark rather than holding them until the end of the replay.
            if last_ts is not None:
                candidates.extend(tracker.flush(last_ts))

            events = _dedupe(candidates, seen)
            if events:
                async with AsyncSessionLocal() as writer:
                    async with writer.begin():
                        await writer.execute(insert(StopArrivalEvent), events)
                total += len(events)

            print(f"  …processed up to {last_ts}: {total} arrivals so far", flush=True)
            if len(rows) < batch_size:
                break

    # Anything still sitting at an origin when the positions ran out.
    trailing = _dedupe(tracker.flush(last_ts or datetime.now(timezone.utc), force=True), seen)
    if trailing:
        async with AsyncSessionLocal() as writer:
            async with writer.begin():
                await writer.execute(insert(StopArrivalEvent), trailing)
        total += len(trailing)

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

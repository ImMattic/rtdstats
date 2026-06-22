"""Observed on-time performance from vehicle positions vs. the static schedule.

RTD's GTFS-RT TripUpdate feed leaves ``arrival.delay`` unset (it only sends the
predicted ``arrival.time``), so the old delay-based on-time number read ~100%
on-time — useless.  Instead we measure adherence the way RTD itself does: take
where a bus *actually* is (``vehicle_positions``, polled every ~30s), geofence it
against its trip's scheduled timepoints, and compare the observed arrival time
to the scheduled time.

The two public entry points:
  * ``classify_arrival`` — pure function: one position + the schedule + an
    observation time → one arrival event dict (or ``None``).  No I/O, easy to
    unit-test.
  * ``detect_arrivals`` — maps ``classify_arrival`` over a poll's worth of
    positions, loading the cached schedule and de-duping so a bus loitering near
    a timepoint yields a single event.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from math import asin, cos, radians, sin, sqrt
from typing import Any
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.services.gtfs_schedule import load_trip_stop_schedule

_settings = get_settings()
_DENVER = ZoneInfo("America/Denver")
_EARTH_RADIUS_M = 6_371_000.0

# In-memory record of arrivals already emitted, keyed by (trip_id, stop_sequence,
# service_date).  The DB unique index is the authoritative dedup across process
# restarts; this just avoids re-emitting on every 30s poll while a bus sits at a
# stop.  Pruned to recent service dates so it can't grow unbounded.
_recorded: set[tuple[str, int, date]] = set()


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two WGS84 points, in metres."""
    p1, p2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(p1) * cos(p2) * sin(dlambda / 2) ** 2
    return 2 * _EARTH_RADIUS_M * asin(sqrt(a))


def _scheduled_utc(service_date: date, arrival_secs: int) -> datetime:
    """Absolute UTC time of a GTFS arrival (seconds-since-local-midnight).

    GTFS allows ``arrival_secs >= 86400`` for trips running past midnight; adding
    a timedelta to the service date's local midnight handles that (and DST)
    correctly before converting to UTC.
    """
    midnight = datetime.combine(service_date, time(0, 0), tzinfo=_DENVER)
    return (midnight + timedelta(seconds=arrival_secs)).astimezone(timezone.utc)


def classify_arrival(
    vp_row: dict[str, Any],
    schedule: dict[str, list[tuple[int, str, int, float, float]]],
    actual_time: datetime,
    *,
    radius_m: float | None = None,
    max_delay_s: int | None = None,
) -> dict[str, Any] | None:
    """Turn one vehicle position into a stop-arrival event, or ``None``.

    Returns ``None`` when the position has no usable trip/coords, the trip isn't
    in the static schedule, the bus isn't within ``radius_m`` of any timepoint,
    or the closest schedule match is implausibly far off (``max_delay_s``).

    ``delay_seconds`` is positive when late, negative when early.
    """
    radius_m = _settings.arrival_radius_m if radius_m is None else radius_m
    max_delay_s = _settings.arrival_max_delay_seconds if max_delay_s is None else max_delay_s

    trip_id = vp_row.get("trip_id")
    lat = vp_row.get("latitude")
    lon = vp_row.get("longitude")
    if not trip_id or lat is None or lon is None:
        return None

    timepoints = schedule.get(trip_id)
    if not timepoints:
        return None

    current_status = vp_row.get("current_status")
    current_stop_seq = vp_row.get("current_stop_sequence")

    # Nearest timepoint to the live position.
    best_dist = None
    best_tp: tuple[int, str, int, float, float] | None = None
    for tp in timepoints:
        seq, _, _, tp_lat, tp_lon = tp
        # When IN_TRANSIT_TO (status=2) the next stop, the vehicle has already
        # departed the previous stop but not yet arrived at current_stop_seq.
        # Skip any timepoint at or beyond current_stop_seq — firing for the
        # next stop early (e.g. while the bus waits at a red light 80m away)
        # would record a large negative delay and lock out the true arrival.
        if current_status == 2 and current_stop_seq is not None and seq >= current_stop_seq:
            continue
        d = _haversine_m(lat, lon, tp_lat, tp_lon)
        if best_dist is None or d < best_dist:
            best_dist, best_tp = d, tp
    if best_tp is None or best_dist > radius_m:
        return None

    seq, stop_id, arrival_secs, _, _ = best_tp

    # Pick the service date whose scheduled time is closest to the observation —
    # handles trips whose schedule crosses local midnight.
    local_date = actual_time.astimezone(_DENVER).date()
    best: tuple[float, date, datetime] | None = None
    for sd in (local_date, local_date - timedelta(days=1)):
        scheduled = _scheduled_utc(sd, arrival_secs)
        delay = (actual_time - scheduled).total_seconds()
        if best is None or abs(delay) < abs(best[0]):
            best = (delay, sd, scheduled)

    delay_seconds, service_date, scheduled_time = best
    if abs(delay_seconds) > max_delay_s:
        return None

    return {
        "trip_id": trip_id,
        "route_id": vp_row.get("route_id"),
        "stop_id": stop_id,
        "stop_sequence": seq,
        "scheduled_time": scheduled_time,
        "actual_time": actual_time,
        "delay_seconds": round(delay_seconds),
        "service_date": service_date,
        "timestamp": actual_time,
    }


def _prune_recorded(today: date) -> None:
    """Drop dedup keys older than yesterday so the set stays small."""
    cutoff = today - timedelta(days=1)
    if any(sd < cutoff for _, _, sd in _recorded):
        stale = {k for k in _recorded if k[2] < cutoff}
        _recorded.difference_update(stale)


def detect_arrivals(
    vp_rows: list[dict[str, Any]],
    default_time: datetime,
) -> list[dict[str, Any]]:
    """Derive de-duplicated stop-arrival events for one poll's positions.

    Each row's own ``timestamp`` is used as the observation time when present
    (so the same code backfills historical positions); ``default_time`` is the
    fallback.
    """
    schedule = load_trip_stop_schedule()
    if not schedule:
        return []

    events: list[dict[str, Any]] = []
    for row in vp_rows:
        actual = row.get("timestamp") or default_time
        event = classify_arrival(row, schedule, actual)
        if event is None:
            continue
        key = (event["trip_id"], event["stop_sequence"], event["service_date"])
        if key in _recorded:
            continue
        _recorded.add(key)
        events.append(event)

    _prune_recorded(default_time.astimezone(_DENVER).date())
    return events

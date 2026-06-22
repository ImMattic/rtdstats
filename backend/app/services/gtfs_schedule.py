"""Scheduled-service analytics derived from the GTFS *static* feeds.

GTFS-RT tells us what actually happened; the static schedule tells us what was
*supposed* to happen.  Comparing the two is what makes the dashboard useful for
budget/service decisions: scheduled trips vs. trips actually operated, and
scheduled headway vs. delivered frequency.

This module parses ``trips.txt`` + ``calendar.txt`` + ``stop_times.txt`` once and
caches a compact per-route summary in module globals — the same pattern as
``gtfs_decoder.load_gtfs_static_data``.  To stay light on a small VM we only keep
*one* departure per trip (its origin/first-stop departure), which is enough to
estimate trips-per-day, headway-by-hour, and span of service per direction.
"""
from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path
from typing import Any

from app.services.gtfs_decoder import (
    TRANSIT_FOLDERS,
    load_gtfs_static_data,
    resolve_gtfs_static_root,
)

# {route_id: route_schedule_dict}.  None until first load.
_schedule_cache: dict[str, dict[str, Any]] | None = None

# {trip_id: [(stop_sequence, stop_id, arrival_secs, stop_lat, stop_lon), ...]}.
# Only timepoint stops are kept (see load_trip_stop_schedule).  None until first
# load.
_trip_stop_schedule_cache: dict[str, list[tuple[int, str, int, float, float]]] | None = None

# {route_id: {"0": {"headsign": str, "trip_ids": [str]}, "1": {...}}}.
# None until first load.
_direction_info_cache: dict[str, dict[str, dict[str, Any]]] | None = None


def _parse_gtfs_time(value: str | None) -> int | None:
    """Parse a GTFS ``HH:MM:SS`` time into seconds since midnight.

    GTFS allows hours >= 24 for trips that run past midnight; we keep them as-is
    (callers fold into 0-23 via modulo when bucketing by hour-of-day)."""
    if not value:
        return None
    parts = value.strip().split(":")
    if len(parts) != 3:
        return None
    try:
        h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        return None
    return h * 3600 + m * 60 + s


def _fmt_hm(seconds: int | None) -> str | None:
    if seconds is None:
        return None
    h = (seconds // 3600) % 24
    m = (seconds % 3600) // 60
    return f"{h:02d}:{m:02d}"


_DOW = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def _load_service_daytypes(root: Path) -> dict[str, dict[str, bool]]:
    """{service_id: {dow: bool}} for all seven days of the week.

    Tracking each day separately avoids double-counting when a route has
    mutually-exclusive service_ids for different day subsets (e.g. RTD's
    MT = Mon-Thu, FR = Friday-only — both have 'weekday=True' under the
    old collapsed approach, inflating scheduled trips by ~2x).
    """
    daytypes: dict[str, dict[str, bool]] = {}
    for folder in TRANSIT_FOLDERS:
        f = root / folder / "calendar.txt"
        if not f.exists():
            continue
        with f.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                sid = row.get("service_id")
                if not sid:
                    continue
                daytypes[sid] = {dow: row.get(dow) == "1" for dow in _DOW}
    return daytypes


def _load_trip_meta(root: Path) -> dict[str, tuple[str, str, str]]:
    """{trip_id: (route_id, service_id, direction_id)}."""
    meta: dict[str, tuple[str, str, str]] = {}
    for folder in TRANSIT_FOLDERS:
        f = root / folder / "trips.txt"
        if not f.exists():
            continue
        with f.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                tid = row.get("trip_id")
                rid = row.get("route_id")
                if not tid or not rid:
                    continue
                meta[tid] = (rid, row.get("service_id", ""), row.get("direction_id", "0"))
    return meta


def _load_trip_origin_departures(root: Path) -> dict[str, int]:
    """{trip_id: origin_departure_seconds} — the departure at each trip's
    first (minimum stop_sequence) stop."""
    best_seq: dict[str, int] = {}
    origin_dep: dict[str, int] = {}
    for folder in TRANSIT_FOLDERS:
        f = root / folder / "stop_times.txt"
        if not f.exists():
            continue
        with f.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                tid = row.get("trip_id")
                seq_str = row.get("stop_sequence")
                if not tid or not seq_str:
                    continue
                try:
                    seq = int(seq_str)
                except ValueError:
                    continue
                if tid in best_seq and seq >= best_seq[tid]:
                    continue
                dep = _parse_gtfs_time(row.get("departure_time") or row.get("arrival_time"))
                if dep is None:
                    continue
                best_seq[tid] = seq
                origin_dep[tid] = dep
    return origin_dep


def _build_schedule(gtfs_static_root: Path | None = None) -> dict[str, dict[str, Any]]:
    root = gtfs_static_root or resolve_gtfs_static_root()

    daytypes = _load_service_daytypes(root)
    trip_meta = _load_trip_meta(root)
    origin_dep = _load_trip_origin_departures(root)

    # Per route: trip counts per day-of-week and Monday origin departures for
    # headway estimation.  Tracking all 7 DOWs separately avoids double-counting
    # mutually-exclusive service_ids (e.g. RTD MT vs FR).
    _zero_dow: dict[str, int] = {d: 0 for d in _DOW}
    trips_per_dow: dict[str, dict[str, int]] = defaultdict(lambda: dict(_zero_dow))
    weekday_deps: dict[str, dict[str, list[int]]] = defaultdict(
        lambda: defaultdict(list))  # route_id -> direction -> [dep_secs]

    for tid, (rid, sid, direction) in trip_meta.items():
        dt = daytypes.get(sid)
        if dt:
            for dow in _DOW:
                if dt[dow]:
                    trips_per_dow[rid][dow] += 1
        dep = origin_dep.get(tid)
        # Use Monday as the representative weekday for headway estimation so we
        # don't double-count Mon-Thu + Friday-only trips.
        if dep is not None and dt is not None and dt["monday"]:
            weekday_deps[rid][direction].append(dep)

    schedule: dict[str, dict[str, Any]] = {}
    all_route_ids = set(trips_per_dow) | set(weekday_deps)
    for rid in all_route_ids:
        tdow = trips_per_dow.get(rid, dict(_zero_dow))
        dirs = weekday_deps.get(rid, {})

        # Headway by hour-of-day: per direction, count departures per hour and
        # take 60/count; average across directions that run that hour.
        hour_headways: dict[int, float | None] = {}
        all_deps: list[int] = []
        for hour in range(24):
            per_dir: list[float] = []
            for deps in dirs.values():
                cnt = sum(1 for d in deps if (d // 3600) % 24 == hour)
                if cnt > 0:
                    per_dir.append(60.0 / cnt)
            hour_headways[hour] = round(sum(per_dir) / len(per_dir), 1) if per_dir else None
        for deps in dirs.values():
            all_deps.extend(deps)

        span_start = min(all_deps) if all_deps else None
        span_end = max(all_deps) if all_deps else None

        schedule[rid] = {
            "route_id": rid,
            # Monday as representative weekday for display; per-DOW dict used
            # for accurate scheduled-trip counting in service delivery.
            "weekday_trips": tdow["monday"],
            "saturday_trips": tdow["saturday"],
            "sunday_trips": tdow["sunday"],
            "trips_per_dow": tdow,
            "service_span": {"start": _fmt_hm(span_start), "end": _fmt_hm(span_end)},
            "headways_by_hour": hour_headways,
        }
    return schedule


def load_schedule_summary(gtfs_static_root: Path | None = None) -> dict[str, dict[str, Any]]:
    """Return the cached {route_id: schedule_summary} map, building it on first call."""
    global _schedule_cache
    if _schedule_cache is None:
        _schedule_cache = _build_schedule(gtfs_static_root)
    return _schedule_cache


def _build_trip_stop_schedule(
    gtfs_static_root: Path | None = None,
) -> dict[str, list[tuple[int, str, int, float, float]]]:
    """{trip_id: [(stop_sequence, stop_id, arrival_secs, stop_lat, stop_lon)]}.

    Only *timepoint* stops (``timepoint == "1"``) are kept.  Timepoints are the
    stops RTD itself uses to measure schedule adherence, so they are both the
    correct place to gauge on-time performance and a ~10x smaller slice of
    ``stop_times.txt`` than every stop — important on a small VM.

    Stop coordinates are joined from the GTFS *stops* table so the observed
    on-time logic can geofence a live vehicle against each timepoint.
    """
    root = gtfs_static_root or resolve_gtfs_static_root()
    _, stops = load_gtfs_static_data(gtfs_static_root=root)

    schedule: dict[str, list[tuple[int, str, int, float, float]]] = defaultdict(list)
    for folder in TRANSIT_FOLDERS:
        f = root / folder / "stop_times.txt"
        if not f.exists():
            continue
        with f.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                if row.get("timepoint") != "1":
                    continue
                tid = row.get("trip_id")
                stop_id = (row.get("stop_id") or "").strip()
                seq_str = row.get("stop_sequence")
                if not tid or not stop_id or not seq_str:
                    continue
                arr_secs = _parse_gtfs_time(
                    row.get("arrival_time") or row.get("departure_time")
                )
                if arr_secs is None:
                    continue
                stop = stops.get(stop_id)
                if not stop or not stop.get("stop_lat") or not stop.get("stop_lon"):
                    continue
                try:
                    seq = int(seq_str)
                except ValueError:
                    continue
                schedule[tid].append(
                    (seq, stop_id, arr_secs, stop["stop_lat"], stop["stop_lon"])
                )

    # Sort each trip's timepoints by sequence for deterministic iteration.
    for stops_list in schedule.values():
        stops_list.sort(key=lambda s: s[0])
    return dict(schedule)


def load_trip_stop_schedule(
    gtfs_static_root: Path | None = None,
) -> dict[str, list[tuple[int, str, int, float, float]]]:
    """Return the cached per-trip timepoint schedule, building it on first call."""
    global _trip_stop_schedule_cache
    if _trip_stop_schedule_cache is None:
        _trip_stop_schedule_cache = _build_trip_stop_schedule(gtfs_static_root)
    return _trip_stop_schedule_cache


def scheduled_trips_for_daytype(route_id: str, daytype: str) -> int | None:
    """Scheduled trips for one route on a given day-type (weekday/saturday/sunday)."""
    summary = load_schedule_summary().get(route_id)
    if not summary:
        return None
    return summary.get(f"{daytype}_trips")


def _build_direction_info(gtfs_static_root: Path | None = None) -> dict[str, dict[str, dict[str, Any]]]:
    """Build {route_id: {direction_id: {headsign, trip_ids}}} from trips.txt.

    For each route+direction pair, picks the most common trip_headsign as the
    canonical direction label (e.g. "Union Station" vs "Englewood Station").
    """
    root = gtfs_static_root or resolve_gtfs_static_root()

    # route_id -> direction_id -> {headsign -> count, trip_ids: [...]}
    raw: dict[str, dict[str, dict[str, Any]]] = defaultdict(lambda: defaultdict(lambda: {"counts": defaultdict(int), "trip_ids": []}))

    for folder in TRANSIT_FOLDERS:
        f = root / folder / "trips.txt"
        if not f.exists():
            continue
        with f.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                tid = row.get("trip_id", "").strip()
                rid = row.get("route_id", "").strip()
                did = row.get("direction_id", "0").strip() or "0"
                headsign = row.get("trip_headsign", "").strip()
                if not tid or not rid:
                    continue
                raw[rid][did]["counts"][headsign] += 1
                raw[rid][did]["trip_ids"].append(tid)

    result: dict[str, dict[str, dict[str, Any]]] = {}
    for rid, dirs in raw.items():
        result[rid] = {}
        for did, info in dirs.items():
            top_headsign = max(info["counts"], key=lambda h: info["counts"][h], default="")
            result[rid][did] = {"headsign": top_headsign, "trip_ids": info["trip_ids"]}
    return result


def load_route_direction_info(
    gtfs_static_root: Path | None = None,
) -> dict[str, dict[str, dict[str, Any]]]:
    """Return cached direction info, building it on first call."""
    global _direction_info_cache
    if _direction_info_cache is None:
        _direction_info_cache = _build_direction_info(gtfs_static_root)
    return _direction_info_cache

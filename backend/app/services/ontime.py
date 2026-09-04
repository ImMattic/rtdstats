"""Observed on-time performance from vehicle positions vs. the static schedule.

RTD's GTFS-RT TripUpdate feed leaves ``arrival.delay`` unset (it only sends the
predicted ``arrival.time``), so the old delay-based on-time number read ~100%
on-time — useless.  Instead we measure adherence the way RTD itself does: take
where a bus *actually* is (``vehicle_positions``, polled every ~30s), project it
onto the inter-timepoint route polyline, and compare the observed arrival time
to the scheduled time.

The projection approach (vs. the old haversine circle) gives two improvements:
  1. Route-direction awareness — vehicles on parallel streets that happen to be
     within 100 m crow-flies of a stop are filtered out by the lateral-distance
     check before the per-timepoint search even runs.
  2. Unambiguous nearest-stop assignment — "nearest by route distance" resolves
     correctly even when two timepoints are on the same block in opposite
     directions; sequence skipping for IN_TRANSIT_TO status provides a second
     guard.

The **origin** timepoint is the one exception, and it is timed differently — see
``OriginDepartureTracker`` below.

The public entry points:
  * ``classify_arrival`` — pure function: one position + the 6-tuple shape-dist
    schedule + an observation time → one arrival event dict (or ``None``).
    No I/O, easy to unit-test.
  * ``OriginDepartureTracker`` — stateful: a stream of positions in time order →
    one *departure* event per trip origin.
  * ``detect_arrivals`` — runs both over a poll's worth of positions, loading the
    cached schedule and de-duping so a bus loitering near a timepoint yields a
    single event.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from math import asin, cos, radians, sin, sqrt
from typing import Any
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.services.gtfs_schedule import (
    load_stop_arrivals_index,
    load_trip_origin_timepoints,
    load_trip_shape_dist_schedule,
)

_settings = get_settings()
_DENVER = ZoneInfo("America/Denver")
_EARTH_RADIUS_M = 6_371_000.0

# In-memory record of arrivals already emitted, keyed by (trip_id, stop_sequence,
# service_date).  The DB unique index is the authoritative dedup across process
# restarts; this just avoids re-emitting on every 30s poll while a bus sits at a
# stop.  Pruned to recent service dates so it can't grow unbounded.
_recorded: set[tuple[str, int, date]] = set()

# Origin-departure state for the live ingest loop.  Built on first poll (see
# _live_tracker) because it needs the GTFS static caches to be warm.
_live_tracker_instance: OriginDepartureTracker | None = None


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


def _project_onto_route(
    lat: float,
    lon: float,
    timepoints: list[tuple[int, str, int, float, float, float]],
) -> tuple[float, float]:
    """Project (lat, lon) onto the inter-timepoint polyline.

    Treats each consecutive pair of timepoints as a straight line segment,
    finds the closest projected point across all segments, and returns:
      (vehicle_dist_m, lateral_dist_m)

    vehicle_dist_m — cumulative route distance of the closest projected point
    lateral_dist_m — perpendicular distance from the route (metres, haversine)

    For a single-timepoint trip the lateral distance is just the haversine to
    that timepoint and vehicle_dist_m is 0.
    """
    if len(timepoints) == 1:
        _, _, _, tp_lat, tp_lon, tp_dist = timepoints[0]
        return tp_dist, _haversine_m(lat, lon, tp_lat, tp_lon)

    best_perp = float("inf")
    best_proj_d = 0.0

    for i in range(len(timepoints) - 1):
        alat, alon, adist = timepoints[i][3], timepoints[i][4], timepoints[i][5]
        blat, blon, bdist = timepoints[i + 1][3], timepoints[i + 1][4], timepoints[i + 1][5]

        dx = blon - alon
        dy = blat - alat
        seg_sq = dx * dx + dy * dy

        t = (
            max(0.0, min(1.0, ((lon - alon) * dx + (lat - alat) * dy) / seg_sq))
            if seg_sq > 1e-18
            else 0.0
        )

        clat = alat + t * dy
        clon = alon + t * dx
        perp = _haversine_m(lat, lon, clat, clon)

        if perp < best_perp:
            best_perp = perp
            best_proj_d = adist + t * (bdist - adist)

    return best_proj_d, best_perp


def _pick_service_date(
    actual_time: datetime, arrival_secs: int
) -> tuple[float, date, datetime]:
    """(delay_seconds, service_date, scheduled_time) for one scheduled stop time.

    Picks the service date whose scheduled time is closest to the observation —
    handles trips whose schedule crosses local midnight.
    """
    local_date = actual_time.astimezone(_DENVER).date()
    best: tuple[float, date, datetime] | None = None
    for sd in (local_date, local_date - timedelta(days=1)):
        scheduled = _scheduled_utc(sd, arrival_secs)
        delay = (actual_time - scheduled).total_seconds()
        if best is None or abs(delay) < abs(best[0]):
            best = (delay, sd, scheduled)
    assert best is not None
    return best


def _build_event(
    *,
    trip_id: str,
    route_id: str | None,
    stop_id: str,
    stop_sequence: int,
    arrival_secs: int,
    actual_time: datetime,
    lat: float,
    lon: float,
    bearing: float | None,
    max_delay_s: int,
    stop_arrivals: dict[tuple[str, str], list[int]] | None,
) -> dict[str, Any] | None:
    """Turn a matched (stop, observation time) pair into a stop-event row.

    Shared by arrival and origin-departure detection: both apply the same
    service-date resolution, implausible-match guard and cross-trip
    misassignment check before a row is worth storing.
    """
    delay_seconds, service_date, scheduled_time = _pick_service_date(actual_time, arrival_secs)
    if abs(delay_seconds) > max_delay_s:
        return None

    # If the delay exceeds the on-time threshold, check whether another trip on
    # the same route is scheduled closer to actual_time at this stop.  A closer
    # competing trip means the GTFS-RT trip_id is likely a misassignment — common
    # on high-frequency routes where the headway matches the apparent delay.
    if abs(delay_seconds) > _settings.ontime_threshold_seconds and route_id:
        arrivals = stop_arrivals if stop_arrivals is not None else load_stop_arrivals_index()
        competing = arrivals.get((route_id, stop_id))
        if competing:
            midnight = datetime.combine(service_date, time(0, 0), tzinfo=_DENVER)
            actual_secs = (actual_time.astimezone(_DENVER) - midnight).total_seconds()
            closest_gap = min(abs(s - actual_secs) for s in competing)
            if closest_gap < abs(delay_seconds):
                return None

    return {
        "trip_id": trip_id,
        "route_id": route_id,
        "stop_id": stop_id,
        "stop_sequence": stop_sequence,
        "scheduled_time": scheduled_time,
        "actual_time": actual_time,
        "delay_seconds": round(delay_seconds),
        "service_date": service_date,
        "timestamp": actual_time,
        "actual_lat": lat,
        "actual_lon": lon,
        "actual_bearing": bearing,
    }


def classify_arrival(
    vp_row: dict[str, Any],
    schedule: dict[str, list[tuple[int, str, int, float, float, float]]],
    actual_time: datetime,
    *,
    radius_m: float | None = None,
    max_delay_s: int | None = None,
    stop_arrivals: dict[tuple[str, str], list[int]] | None = None,
    skip_sequence: int | None = None,
) -> dict[str, Any] | None:
    """Turn one vehicle position into a stop-arrival event, or ``None``.

    ``schedule`` maps trip_id → list of 6-tuples:
      (stop_sequence, stop_id, arrival_secs, stop_lat, stop_lon, cumulative_dist_m)

    ``stop_arrivals`` maps (route_id, stop_id) → sorted list of arrival_secs for
    all trips on that route.  When provided (or loaded from cache when ``None``),
    arrivals whose delay exceeds the on-time threshold are suppressed if another
    trip on the same route is scheduled closer to the actual arrival time — the
    signature of a GTFS-RT trip_id misassignment on high-frequency routes.  Pass
    an empty dict to disable the check (useful in tests).

    ``skip_sequence`` excludes one stop_sequence from the nearest-timepoint
    search.  Callers pass the trip's origin here: that stop is timed by
    ``OriginDepartureTracker`` (departure, not arrival), and matching it as an
    arrival too would record the layover instead.

    Returns ``None`` when the position has no usable trip/coords, the trip isn't
    in the schedule, the vehicle is more than ``radius_m`` off-route (lateral
    distance), no timepoint is within ``radius_m`` along the route, the closest
    schedule match is implausibly far off (``max_delay_s``), or a better-matching
    trip exists on the same route at this stop.

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

    # Project vehicle onto the inter-timepoint route polyline.
    vehicle_dist_m, lateral_m = _project_onto_route(lat, lon, timepoints)

    # Gate on lateral distance: vehicle must be close to the route itself.
    if lateral_m > radius_m:
        return None

    # Find the nearest timepoint by route-distance.
    # When IN_TRANSIT_TO (status=2) the next stop, skip any timepoint at or
    # beyond current_stop_seq — firing early while the bus approaches at a red
    # light would record a large negative delay and lock out the true arrival.
    best_gap: float | None = None
    best_tp: tuple[int, str, int, float, float, float] | None = None
    for tp in timepoints:
        seq, _, _, _, _, tp_dist_m = tp
        if skip_sequence is not None and seq == skip_sequence:
            continue
        if current_status == 2 and current_stop_seq is not None and seq >= current_stop_seq:
            continue
        gap = abs(vehicle_dist_m - tp_dist_m)
        if best_gap is None or gap < best_gap:
            best_gap, best_tp = gap, tp

    if best_tp is None or best_gap > radius_m:
        return None

    seq, stop_id, arrival_secs, _, _, _ = best_tp

    return _build_event(
        trip_id=trip_id,
        route_id=vp_row.get("route_id"),
        stop_id=stop_id,
        stop_sequence=seq,
        arrival_secs=arrival_secs,
        actual_time=actual_time,
        lat=lat,
        lon=lon,
        bearing=vp_row.get("bearing"),
        max_delay_s=max_delay_s,
        stop_arrivals=stop_arrivals,
    )


# ── Origin departures ────────────────────────────────────────────────────────
#
# At every stop but the first, the arrival is the event worth timing: the vehicle
# shows up, dwells ~20 s, leaves.  The origin terminal is the opposite.  A bus
# lays over at the gate — already carrying its *next* trip_id in the GTFS-RT feed
# — for minutes before it pulls out, so its first geofenced snapshot there times
# the layover, not the trip.  (Observed: an FF1 leaving Downtown Boulder Station
# Gate 1 at 18:30 sharp was logged as departing at 18:27.)
#
# So the origin is timed by *departure*: the moment the vehicle crossed
# ``origin_departure_radius_m`` from the origin stop, linearly interpolated
# between the last snapshot inside that circle and the first one outside.  The
# interpolation is what keeps this accurate — at a 30 s poll interval, taking
# either raw snapshot instead would be up to half a minute off, and the two
# biases it splits (the vehicle sitting still for part of the gap, then
# accelerating away) largely cancel.
#
# Straight-line distance from the stop, not route distance, is deliberate: a
# vehicle parked in a bay or staging behind the stop projects onto the route
# corridor unpredictably, but "how far from the gate" is unambiguous.


@dataclass
class _PendingDeparture:
    """A vehicle seen at its trip's origin, waiting to be seen leaving."""

    trip_id: str
    route_id: str | None
    stop_id: str
    stop_sequence: int
    arrival_secs: int
    service_date: date
    # Latest snapshot still inside the departure circle — the interpolation's
    # inner endpoint, and the position recorded on the event.
    last_inside_time: datetime
    last_inside_dist_m: float
    lat: float
    lon: float
    bearing: float | None


def _interpolate_crossing(
    t_in: datetime,
    d_in: float,
    t_out: datetime,
    d_out: float,
    radius_m: float,
) -> datetime:
    """When the vehicle crossed ``radius_m``, between an inside and outside fix.

    Linear in distance over the gap between the two snapshots, clamped to the
    gap itself so a GPS jump far from the stop can't project the crossing
    outside the interval we actually observed.
    """
    span = d_out - d_in
    if span <= 0:
        return t_out
    frac = max(0.0, min(1.0, (radius_m - d_in) / span))
    return t_in + (t_out - t_in) * frac


class OriginDepartureTracker:
    """Streams positions in time order and emits one departure per trip origin.

    Unlike ``classify_arrival`` this cannot be a pure per-position function: a
    departure is only knowable from *two* snapshots, one at the stop and one
    away from it.  Feed every position for a poll (or a backfill batch) through
    ``feed``, then call ``flush`` with the current watermark.

    The same instance is reused across polls by ``detect_arrivals``; the backfill
    script builds its own.  State is small — one entry per trip currently sitting
    at its origin, plus the (trip, stop, date) keys already emitted.
    """

    def __init__(
        self,
        origins: dict[str, tuple[int, str, int, float, float]] | None = None,
        *,
        radius_m: float | None = None,
        max_delay_s: int | None = None,
        stop_arrivals: dict[tuple[str, str], list[int]] | None = None,
        stale_after: timedelta | None = None,
    ) -> None:
        self._origins = origins
        self._radius_m = (
            _settings.origin_departure_radius_m if radius_m is None else radius_m
        )
        self._max_delay_s = (
            _settings.arrival_max_delay_seconds if max_delay_s is None else max_delay_s
        )
        self._stop_arrivals = stop_arrivals
        self._stale_after = stale_after or timedelta(
            minutes=_settings.origin_departure_stale_minutes
        )
        self._pending: dict[tuple[str, date], _PendingDeparture] = {}
        # (trip_id, stop_sequence, service_date) already emitted — stops a loop
        # route that passes its origin again from re-arming.
        self._done: set[tuple[str, int, date]] = set()

    @property
    def origins(self) -> dict[str, tuple[int, str, int, float, float]]:
        if self._origins is None:
            self._origins = load_trip_origin_timepoints()
        return self._origins

    def feed(self, vp_row: dict[str, Any], actual_time: datetime) -> dict[str, Any] | None:
        """Absorb one position; return a departure event when one just resolved."""
        trip_id = vp_row.get("trip_id")
        lat = vp_row.get("latitude")
        lon = vp_row.get("longitude")
        if not trip_id or lat is None or lon is None:
            return None

        origin = self.origins.get(trip_id)
        if origin is None:
            return None
        seq, stop_id, arrival_secs, origin_lat, origin_lon = origin

        _, service_date, _ = _pick_service_date(actual_time, arrival_secs)
        if (trip_id, seq, service_date) in self._done:
            return None

        dist_m = _haversine_m(lat, lon, origin_lat, origin_lon)
        key = (trip_id, service_date)
        pending = self._pending.get(key)

        if dist_m <= self._radius_m:
            # Still at the origin — keep the newest fix as the inner endpoint.
            if pending is None:
                pending = _PendingDeparture(
                    trip_id=trip_id,
                    route_id=vp_row.get("route_id"),
                    stop_id=stop_id,
                    stop_sequence=seq,
                    arrival_secs=arrival_secs,
                    service_date=service_date,
                    last_inside_time=actual_time,
                    last_inside_dist_m=dist_m,
                    lat=lat,
                    lon=lon,
                    bearing=vp_row.get("bearing"),
                )
                self._pending[key] = pending
            else:
                pending.route_id = vp_row.get("route_id") or pending.route_id
                pending.last_inside_time = actual_time
                pending.last_inside_dist_m = dist_m
                pending.lat, pending.lon = lat, lon
                pending.bearing = vp_row.get("bearing")
            return None

        # Outside the circle.  Without a sighting at the stop we have no inner
        # endpoint and no idea when it left — the trip_id was attached too late.
        if pending is None:
            return None

        # …but the feed still placing the vehicle at or before the origin means
        # it hasn't started: at a big station (Union, Downtown Boulder) the gates
        # are far enough apart that repositioning between them clears the circle.
        # Wait for a later fix rather than timing the shuffle as a departure.
        current_stop_seq = vp_row.get("current_stop_sequence")
        if current_stop_seq is not None and current_stop_seq <= seq:
            return None

        del self._pending[key]
        self._done.add((trip_id, seq, service_date))
        departed_at = _interpolate_crossing(
            pending.last_inside_time,
            pending.last_inside_dist_m,
            actual_time,
            dist_m,
            self._radius_m,
        )
        return self._emit(pending, departed_at)

    def flush(self, now: datetime, *, force: bool = False) -> list[dict[str, Any]]:
        """Resolve origins we never saw leave, once the trip has gone quiet.

        A trip can vanish from the feed mid-layover (cancelled, or the vehicle
        reassigned).  Rather than drop the event, record the last moment it was
        seen at the stop — a lower bound, and still far closer than the first
        sighting was.  ``force`` drains everything, for end-of-backfill.
        """
        out: list[dict[str, Any]] = []
        for key, pending in list(self._pending.items()):
            if not force and now - pending.last_inside_time < self._stale_after:
                continue
            del self._pending[key]
            self._done.add((pending.trip_id, pending.stop_sequence, pending.service_date))
            event = self._emit(pending, pending.last_inside_time)
            if event is not None:
                out.append(event)
        self._prune_done(now.astimezone(_DENVER).date())
        return out

    def _emit(self, pending: _PendingDeparture, departed_at: datetime) -> dict[str, Any] | None:
        return _build_event(
            trip_id=pending.trip_id,
            route_id=pending.route_id,
            stop_id=pending.stop_id,
            stop_sequence=pending.stop_sequence,
            arrival_secs=pending.arrival_secs,
            actual_time=departed_at,
            lat=pending.lat,
            lon=pending.lon,
            bearing=pending.bearing,
            max_delay_s=self._max_delay_s,
            stop_arrivals=self._stop_arrivals,
        )

    def _prune_done(self, today: date) -> None:
        cutoff = today - timedelta(days=1)
        if any(sd < cutoff for _, _, sd in self._done):
            self._done.difference_update({k for k in self._done if k[2] < cutoff})


def _prune_recorded(today: date) -> None:
    """Drop dedup keys older than yesterday so the set stays small."""
    cutoff = today - timedelta(days=1)
    if any(sd < cutoff for _, _, sd in _recorded):
        stale = {k for k in _recorded if k[2] < cutoff}
        _recorded.difference_update(stale)


def _live_tracker(
    origins: dict[str, tuple[int, str, int, float, float]],
    arrivals_index: dict[tuple[str, str], list[int]],
) -> OriginDepartureTracker:
    """The ingest loop's tracker — one instance, so dwells span polls."""
    global _live_tracker_instance
    if _live_tracker_instance is None:
        _live_tracker_instance = OriginDepartureTracker(
            origins, stop_arrivals=arrivals_index
        )
    return _live_tracker_instance


def detect_arrivals(
    vp_rows: list[dict[str, Any]],
    default_time: datetime,
) -> list[dict[str, Any]]:
    """Derive de-duplicated stop events for one poll's positions.

    Mid-route timepoints yield arrivals; each trip's origin yields a departure
    once the vehicle is seen leaving (so an origin event usually lands a poll or
    two after the vehicle was last at the gate).

    Each row's own ``timestamp`` is used as the observation time when present
    (so the same code backfills historical positions); ``default_time`` is the
    fallback.
    """
    schedule = load_trip_shape_dist_schedule()
    origins = load_trip_origin_timepoints()
    if not schedule and not origins:
        return []

    arrivals_index = load_stop_arrivals_index()
    tracker = _live_tracker(origins, arrivals_index)

    candidates: list[dict[str, Any]] = []
    for row in vp_rows:
        actual = row.get("timestamp") or default_time
        departure = tracker.feed(row, actual)
        if departure is not None:
            candidates.append(departure)
        origin = origins.get(row.get("trip_id") or "")
        arrival = classify_arrival(
            row,
            schedule,
            actual,
            stop_arrivals=arrivals_index,
            skip_sequence=origin[0] if origin else None,
        )
        if arrival is not None:
            candidates.append(arrival)

    candidates.extend(tracker.flush(default_time))

    events: list[dict[str, Any]] = []
    for event in candidates:
        key = (event["trip_id"], event["stop_sequence"], event["service_date"])
        if key in _recorded:
            continue
        _recorded.add(key)
        events.append(event)

    _prune_recorded(default_time.astimezone(_DENVER).date())
    return events


def reset_detection_state() -> None:
    """Drop all in-process dedup/pending state (tests; not used in production)."""
    global _live_tracker_instance
    _recorded.clear()
    _live_tracker_instance = None

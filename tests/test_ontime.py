"""Unit tests for observed on-time classification (app/services/ontime.py).

Pure functions — no DB, no GTFS filesystem. We hand-build a one-trip timepoint
schedule in the 6-tuple format (seq, stop_id, arr_secs, lat, lon, dist_m) and
assert the route-corridor projection + delay + service-date logic.
"""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch

from app.services.ontime import (
    OriginDepartureTracker,
    _haversine_m,
    _project_onto_route,
    _scheduled_utc,
    classify_arrival,
    detect_arrivals,
    reset_detection_state,
)

# A single trip with one timepoint at Denver Union Station, scheduled 08:00 local.
_STOP_LAT, _STOP_LON = 39.7392, -104.9903
_ARR_SECS = 8 * 3600  # 08:00:00
# 6-tuple: (seq, stop_id, arr_secs, lat, lon, cumulative_dist_m)
_SCHEDULE: dict = {"T1": [(5, "S1", _ARR_SECS, _STOP_LAT, _STOP_LON, 0.0)]}
_SERVICE_DATE = date(2026, 6, 20)


def _vp(lat=_STOP_LAT, lon=_STOP_LON, trip_id="T1", route_id="R1"):
    return {"trip_id": trip_id, "route_id": route_id, "latitude": lat, "longitude": lon}


def test_haversine_known_distance():
    # ~0.0009 deg longitude at this latitude is ~77m; sanity-check the metric.
    d = _haversine_m(_STOP_LAT, _STOP_LON, _STOP_LAT, _STOP_LON + 0.0009)
    assert 60 < d < 95


def test_project_onto_route_single_point():
    # Single-point schedule: lateral dist is haversine to the stop.
    tps = [(5, "S1", _ARR_SECS, _STOP_LAT, _STOP_LON, 0.0)]
    proj_d, lateral = _project_onto_route(_STOP_LAT, _STOP_LON, tps)
    assert proj_d == 0.0
    assert lateral < 1.0  # essentially zero at the exact stop location


def test_project_onto_route_two_points():
    # Vehicle halfway between two timepoints should land at ~half the segment dist.
    lat_a, lon_a = 39.730, -104.990
    lat_b, lon_b = 39.740, -104.990
    seg_len = _haversine_m(lat_a, lon_a, lat_b, lon_b)
    tps = [
        (1, "A", 0, lat_a, lon_a, 0.0),
        (2, "B", 600, lat_b, lon_b, seg_len),
    ]
    mid_lat = (lat_a + lat_b) / 2
    proj_d, lateral = _project_onto_route(mid_lat, lon_a, tps)
    assert abs(proj_d - seg_len / 2) < 10  # within 10 m of midpoint
    assert lateral < 5  # on the line


def test_on_time_arrival():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    actual = scheduled + timedelta(seconds=40)
    event = classify_arrival(_vp(), _SCHEDULE, actual)
    assert event is not None
    assert event["stop_id"] == "S1"
    assert event["stop_sequence"] == 5
    assert event["route_id"] == "R1"
    assert event["delay_seconds"] == 40
    assert event["service_date"] == _SERVICE_DATE


def test_arrival_includes_actual_position():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    event = classify_arrival(
        {**_vp(), "bearing": 270.0},
        _SCHEDULE,
        scheduled,
    )
    assert event is not None
    assert event["actual_lat"] == _STOP_LAT
    assert event["actual_lon"] == _STOP_LON
    assert event["actual_bearing"] == 270.0


def test_actual_bearing_none_when_absent():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    event = classify_arrival(_vp(), _SCHEDULE, scheduled)
    assert event is not None
    assert event["actual_bearing"] is None


def test_late_arrival_positive_delay():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    event = classify_arrival(_vp(), _SCHEDULE, scheduled + timedelta(seconds=180))
    assert event is not None and event["delay_seconds"] == 180  # 3 min late


def test_early_arrival_negative_delay():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    event = classify_arrival(_vp(), _SCHEDULE, scheduled - timedelta(seconds=240))
    assert event is not None and event["delay_seconds"] == -240  # 4 min early


def test_lateral_distance_rejects_off_route_vehicle():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    far = _vp(lat=_STOP_LAT + 0.01)  # ~1.1 km north — well outside 100 m lateral
    assert classify_arrival(far, _SCHEDULE, scheduled) is None


def test_unknown_trip_returns_none():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    assert classify_arrival(_vp(trip_id="ghost"), _SCHEDULE, scheduled) is None


def test_missing_coords_returns_none():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    assert classify_arrival({"trip_id": "T1", "latitude": None, "longitude": None},
                            _SCHEDULE, scheduled) is None


def test_implausible_match_dropped():
    # Vehicle at the stop but observed 5 hours off any plausible schedule.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    assert classify_arrival(_vp(), _SCHEDULE, scheduled + timedelta(hours=5)) is None


def test_after_midnight_picks_prior_service_date():
    # GTFS arrival 25:10 (01:10 next calendar day) belongs to 2026-06-20 service.
    schedule: dict = {"T1": [(5, "S1", 25 * 3600 + 10 * 60, _STOP_LAT, _STOP_LON, 0.0)]}
    scheduled = _scheduled_utc(_SERVICE_DATE, 25 * 3600 + 10 * 60)
    actual = scheduled + timedelta(seconds=20)
    event = classify_arrival(_vp(), schedule, actual)
    assert event is not None
    assert event["service_date"] == _SERVICE_DATE  # not the calendar date of `actual`
    assert abs(event["delay_seconds"]) < 60


def test_in_transit_skips_future_timepoint():
    # Status=2 (IN_TRANSIT_TO) next stop: vehicle is at the stop location but
    # hasn't been flagged as arrived yet.  Should return None so we don't lock
    # in a large negative delay before the bus actually shows up.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    early_obs = scheduled - timedelta(minutes=3)
    vp = {**_vp(), "current_status": 2, "current_stop_sequence": 5}
    assert classify_arrival(vp, _SCHEDULE, early_obs) is None


def test_in_transit_fires_for_past_timepoint():
    # Status=2 but current_stop_seq points to a LATER stop (6 > 5), so stop 5
    # is in the past and a nearby match is legitimate.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    actual = scheduled + timedelta(seconds=40)
    vp = {**_vp(), "current_status": 2, "current_stop_sequence": 6}
    event = classify_arrival(vp, _SCHEDULE, actual)
    assert event is not None
    assert event["stop_sequence"] == 5


def test_stopped_at_fires_normally():
    # Status=1 (STOPPED_AT): no filtering; nearest timepoint within radius wins.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    actual = scheduled + timedelta(seconds=60)
    vp = {**_vp(), "current_status": 1, "current_stop_sequence": 5}
    event = classify_arrival(vp, _SCHEDULE, actual)
    assert event is not None
    assert event["delay_seconds"] == 60


def test_unknown_status_falls_back_to_nearest():
    # No current_status/current_stop_sequence: nearest-timepoint behaviour.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    actual = scheduled + timedelta(seconds=30)
    event = classify_arrival(_vp(), _SCHEDULE, actual)
    assert event is not None


def test_detect_arrivals_dedupes_loitering():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    rows = [
        {**_vp(), "timestamp": scheduled},
        {**_vp(), "timestamp": scheduled + timedelta(seconds=30)},  # still at stop
    ]
    reset_detection_state()
    with patch("app.services.ontime.load_trip_shape_dist_schedule", return_value=_SCHEDULE), \
         patch("app.services.ontime.load_trip_origin_timepoints", return_value={}), \
         patch("app.services.ontime.load_stop_arrivals_index", return_value={}):
        events = detect_arrivals(rows, scheduled)
    assert len(events) == 1  # one event despite two snapshots near the stop


def test_detect_arrivals_times_origin_by_departure():
    # End-to-end through the ingest entry point: the trip's origin is stop 5, so
    # the loitering snapshots must NOT be recorded as an arrival — only the
    # departure, once the bus is seen away from the stop.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    rows = [
        {**_vp(), "timestamp": scheduled - timedelta(minutes=3)},  # laying over
        {**_vp(), "timestamp": scheduled},                          # still there
        {**_vp(lat=_STOP_LAT + 0.0045), "timestamp": scheduled + timedelta(seconds=30)},
    ]
    reset_detection_state()
    with patch("app.services.ontime.load_trip_shape_dist_schedule", return_value=_SCHEDULE), \
         patch("app.services.ontime.load_trip_origin_timepoints", return_value=_ORIGINS), \
         patch("app.services.ontime.load_stop_arrivals_index", return_value={}):
        events = detect_arrivals(rows, scheduled + timedelta(seconds=30))
    assert len(events) == 1
    # Departure, not the 3-min-early first sighting.
    assert events[0]["delay_seconds"] > 0
    reset_detection_state()


# ── Origin departures ─────────────────────────────────────────────────────────

# {trip_id: (seq, stop_id, arrival_secs, lat, lon)} — T1's origin is its stop 5.
_ORIGINS: dict = {"T1": (5, "S1", _ARR_SECS, _STOP_LAT, _STOP_LON)}
# ~500 m north of the stop: comfortably outside the 100 m departure circle.
_AWAY_LAT = _STOP_LAT + 0.0045


def _tracker(**kwargs) -> OriginDepartureTracker:
    return OriginDepartureTracker(_ORIGINS, stop_arrivals={}, **kwargs)


def test_origin_dwell_emits_nothing_until_the_vehicle_leaves():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    t = _tracker()
    # Three snapshots parked at the gate, starting 3 min before the departure.
    for offset in (-180, -150, -120):
        assert t.feed(_vp(), scheduled + timedelta(seconds=offset)) is None


def test_origin_departure_is_interpolated_not_the_first_sighting():
    # The reported bug: bus sits at the gate from 3 min before its scheduled
    # departure, then pulls out on time.  The old logic recorded the layover.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    t = _tracker()
    for offset in (-180, -150, -120, -90, -60, -30, 0):
        assert t.feed(_vp(), scheduled + timedelta(seconds=offset)) is None
    # Next poll it is 500 m up the road; it crossed 100 m a fifth of the way in.
    event = t.feed(_vp(lat=_AWAY_LAT), scheduled + timedelta(seconds=30))
    assert event is not None
    assert event["stop_sequence"] == 5
    # ~6 s after schedule (100/500 of a 30 s gap), nowhere near 3 min early.
    assert 0 <= event["delay_seconds"] <= 15
    assert event["actual_time"] >= scheduled


def test_origin_departure_reports_lateness():
    # Same shape, but the bus does not pull out until 4 min after schedule.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    t = _tracker()
    for offset in (-120, 0, 120, 240):
        assert t.feed(_vp(), scheduled + timedelta(seconds=offset)) is None
    event = t.feed(_vp(lat=_AWAY_LAT), scheduled + timedelta(seconds=270))
    assert event is not None
    assert 240 <= event["delay_seconds"] <= 255  # ~4 min late


def test_origin_departure_emitted_once():
    # A loop route passing its own origin later must not re-record it.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    t = _tracker()
    assert t.feed(_vp(), scheduled) is None
    assert t.feed(_vp(lat=_AWAY_LAT), scheduled + timedelta(seconds=30)) is not None
    assert t.feed(_vp(), scheduled + timedelta(minutes=40)) is None
    assert t.feed(_vp(lat=_AWAY_LAT), scheduled + timedelta(minutes=41)) is None


def test_origin_never_seen_at_stop_yields_nothing():
    # trip_id attached only after the bus was already away — we cannot know when
    # it left, so record nothing rather than guessing.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    t = _tracker()
    assert t.feed(_vp(lat=_AWAY_LAT), scheduled + timedelta(seconds=30)) is None
    assert t.flush(scheduled + timedelta(hours=1), force=True) == []


def test_stale_origin_falls_back_to_last_sighting():
    # The trip vanishes from the feed while parked: keep the last moment it was
    # seen at the stop rather than losing the event entirely.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    t = _tracker(stale_after=timedelta(minutes=15))
    last_seen = scheduled + timedelta(seconds=60)
    assert t.feed(_vp(), scheduled) is None
    assert t.feed(_vp(), last_seen) is None
    assert t.flush(last_seen + timedelta(minutes=5)) == []  # not stale yet
    events = t.flush(last_seen + timedelta(minutes=20))
    assert len(events) == 1
    assert events[0]["actual_time"] == last_seen
    assert events[0]["delay_seconds"] == 60


def test_gps_jump_cannot_push_departure_past_the_next_fix():
    # A single wild fix 20 km away must not project the crossing outside the
    # interval we actually observed — clamped to [last inside, this fix].
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    t = _tracker()
    assert t.feed(_vp(), scheduled) is None
    later = scheduled + timedelta(seconds=30)
    event = t.feed(_vp(lat=_STOP_LAT + 0.18), later)
    assert event is not None
    assert scheduled <= event["actual_time"] <= later


def test_repositioning_within_the_station_is_not_a_departure():
    # Clear of the 100 m circle, but the feed still has the vehicle at stop 1 —
    # a shuffle between gates, not the start of the trip.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    t = _tracker()
    assert t.feed(_vp(), scheduled - timedelta(minutes=5)) is None
    staged = {**_vp(lat=_AWAY_LAT), "current_status": 1, "current_stop_sequence": 5}
    assert t.feed(staged, scheduled - timedelta(minutes=4)) is None
    # Back at the gate, then away with the feed advanced to stop 6: departed.
    assert t.feed(_vp(), scheduled) is None
    moving = {**_vp(lat=_AWAY_LAT), "current_status": 2, "current_stop_sequence": 6}
    event = t.feed(moving, scheduled + timedelta(seconds=30))
    assert event is not None
    assert 0 <= event["delay_seconds"] <= 15


def test_origin_skipped_by_arrival_classifier():
    # classify_arrival must leave the origin alone so the layover isn't recorded
    # as an arrival alongside the departure.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    assert classify_arrival(_vp(), _SCHEDULE, scheduled, skip_sequence=5) is None
    assert classify_arrival(_vp(), _SCHEDULE, scheduled, skip_sequence=99) is not None


# ── Cross-trip misassignment detection ────────────────────────────────────────

# Build a two-trip schedule: T1 at 08:00, T2 at 08:15 — same route R1, same stop S1.
_ARR_SECS_T2 = _ARR_SECS + 15 * 60  # 08:15:00
_TWO_TRIP_INDEX: dict = {("R1", "S1"): sorted([_ARR_SECS, _ARR_SECS_T2])}


def test_misassigned_trip_suppressed():
    # Bus on T1 (08:00) but arrives at exactly T2's scheduled time (08:15).
    # The GTFS-RT feed still reports trip_id=T1, making it look 15 min late.
    # A better match (T2) exists in the index → suppress.
    scheduled_t1 = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    actual = scheduled_t1 + timedelta(seconds=15 * 60)
    event = classify_arrival(_vp(), _SCHEDULE, actual, stop_arrivals=_TWO_TRIP_INDEX)
    assert event is None


def test_no_better_match_keeps_arrival():
    # Bus is genuinely late (12 min) but there's no competing trip scheduled
    # closer to the actual time — keep the arrival.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    actual = scheduled + timedelta(seconds=12 * 60)
    # Only T1 in the index for this stop — no better match.
    arrivals_index: dict = {("R1", "S1"): [_ARR_SECS]}
    event = classify_arrival(_vp(), _SCHEDULE, actual, stop_arrivals=arrivals_index)
    assert event is not None
    assert event["delay_seconds"] == 12 * 60


def test_within_ontime_threshold_skips_check():
    # Delay is within the 5-min on-time window — skip the cross-trip check
    # entirely even if a closer trip exists.
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    actual = scheduled + timedelta(seconds=200)  # ~3.3 min late
    event = classify_arrival(_vp(), _SCHEDULE, actual, stop_arrivals=_TWO_TRIP_INDEX)
    assert event is not None
    assert event["delay_seconds"] == 200

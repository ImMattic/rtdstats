"""Unit tests for observed on-time classification (app/services/ontime.py).

Pure functions — no DB, no GTFS filesystem. We hand-build a one-trip timepoint
schedule and assert the geofence + delay + service-date logic.
"""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch

from app.services.ontime import (
    _haversine_m,
    _scheduled_utc,
    classify_arrival,
    detect_arrivals,
)

# A single trip with one timepoint at Denver Union Station, scheduled 08:00 local.
_STOP_LAT, _STOP_LON = 39.7392, -104.9903
_ARR_SECS = 8 * 3600  # 08:00:00
_SCHEDULE = {"T1": [(5, "S1", _ARR_SECS, _STOP_LAT, _STOP_LON)]}
_SERVICE_DATE = date(2026, 6, 20)


def _vp(lat=_STOP_LAT, lon=_STOP_LON, trip_id="T1", route_id="R1"):
    return {"trip_id": trip_id, "route_id": route_id, "latitude": lat, "longitude": lon}


def test_haversine_known_distance():
    # ~0.0009 deg longitude at this latitude is ~77m; sanity-check the metric.
    d = _haversine_m(_STOP_LAT, _STOP_LON, _STOP_LAT, _STOP_LON + 0.0009)
    assert 60 < d < 95


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


def test_late_arrival_positive_delay():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    event = classify_arrival(_vp(), _SCHEDULE, scheduled + timedelta(seconds=180))
    assert event is not None and event["delay_seconds"] == 180  # 3 min late


def test_early_arrival_negative_delay():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    event = classify_arrival(_vp(), _SCHEDULE, scheduled - timedelta(seconds=240))
    assert event is not None and event["delay_seconds"] == -240  # 4 min early


def test_geofence_rejects_far_vehicle():
    scheduled = _scheduled_utc(_SERVICE_DATE, _ARR_SECS)
    far = _vp(lat=_STOP_LAT + 0.01)  # ~1.1 km north — well outside 100 m
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
    schedule = {"T1": [(5, "S1", 25 * 3600 + 10 * 60, _STOP_LAT, _STOP_LON)]}
    scheduled = _scheduled_utc(_SERVICE_DATE, 25 * 3600 + 10 * 60)
    actual = scheduled + timedelta(seconds=20)
    event = classify_arrival(_vp(), schedule, actual)
    assert event is not None
    assert event["service_date"] == _SERVICE_DATE  # not the calendar date of `actual`
    assert abs(event["delay_seconds"]) < 60


def test_in_transit_skips_future_timepoint():
    # Status=2 (IN_TRANSIT_TO) next stop: vehicle is 80m from the stop it's
    # heading toward but hasn't arrived yet.  Should return None so we don't
    # lock in a large negative delay before the bus actually shows up.
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
    # No current_status/current_stop_sequence: original nearest-timepoint behaviour.
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
    with patch("app.services.ontime.load_trip_stop_schedule", return_value=_SCHEDULE):
        events = detect_arrivals(rows, scheduled)
    assert len(events) == 1  # one event despite two snapshots near the stop

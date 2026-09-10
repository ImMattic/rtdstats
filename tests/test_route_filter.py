"""Unit tests for the shared multi-route / mode filter resolver.

`resolve_route_ids` is the single place the Dashboard filter menu's three params
(legacy `route_id`, multi `route_ids`, and `modes` quick-selects) collapse into
one id list for the SQL layer.
"""
from __future__ import annotations

from unittest.mock import patch

from app.api.v1._route_filter import resolve_route_ids

ROUTES_STATIC = {
    "r15": {"route_short_name": "15", "route_type": "3"},   # bus
    "r0":  {"route_short_name": "0", "route_type": "3"},    # bus
    "rE":  {"route_short_name": "E", "route_type": "0"},    # light rail
    "rN":  {"route_short_name": "N", "route_type": "2"},    # commuter rail
}


def _patch_static():
    return patch(
        "app.api.v1._route_filter.load_gtfs_static_data",
        return_value=(ROUTES_STATIC, {}),
    )


def test_none_when_nothing_selected():
    assert resolve_route_ids(None, None, None) is None
    assert resolve_route_ids(None, "", "") is None


def test_legacy_single_route():
    assert resolve_route_ids("r15", None, None) == ["r15"]


def test_explicit_route_ids_csv_is_sorted_and_deduped():
    assert resolve_route_ids(None, "rE,r15,rE", None) == ["r15", "rE"]


def test_legacy_and_multi_merge():
    assert resolve_route_ids("r0", "r15", None) == ["r0", "r15"]


def test_mode_expands_to_route_ids():
    with _patch_static():
        assert resolve_route_ids(None, None, "bus") == ["r0", "r15"]
        assert resolve_route_ids(None, None, "light_rail") == ["rE"]
        assert resolve_route_ids(None, None, "commuter_rail") == ["rN"]


def test_multiple_modes_union():
    with _patch_static():
        assert resolve_route_ids(None, None, "light_rail,commuter_rail") == ["rE", "rN"]


def test_mode_and_explicit_routes_union():
    with _patch_static():
        assert resolve_route_ids(None, "r15", "light_rail") == ["r15", "rE"]


def test_unknown_mode_ignored():
    with _patch_static():
        assert resolve_route_ids(None, None, "monorail") is None

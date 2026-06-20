"""Integration tests for GET /api/v1/realtime/* endpoints.

_latest_positions and _latest_delays are patched because they use
Postgres DISTINCT ON which SQLite doesn't support.
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch, AsyncMock

import pytest

from app.models.vehicle_position import VehiclePosition
from tests.conftest import make_vehicle


@pytest.fixture
def a_vehicle() -> VehiclePosition:
    return make_vehicle(
        id=1,
        route_id="R1",
        vehicle_id="V1",
        lat=39.7392,
        lon=-104.9903,
    )


async def test_get_all_vehicles_empty(client):
    with (
        patch("app.api.v1.realtime._latest_positions", AsyncMock(return_value=[])),
        patch("app.api.v1.realtime._latest_delays", AsyncMock(return_value={})),
    ):
        resp = await client.get("/api/v1/realtime/vehicles")

    assert resp.status_code == 200
    data = resp.json()
    assert data["vehicles"] == []
    assert data["total_vehicles"] == 0


async def test_get_all_vehicles_returns_enriched(client, a_vehicle):
    with (
        patch("app.api.v1.realtime._latest_positions", AsyncMock(return_value=[a_vehicle])),
        patch("app.api.v1.realtime._latest_delays", AsyncMock(return_value={})),
    ):
        resp = await client.get("/api/v1/realtime/vehicles")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["vehicles"]) == 1
    v = data["vehicles"][0]
    assert v["route_id"] == "R1"
    assert v["vehicle_id"] == "V1"
    assert v["latitude"] == pytest.approx(39.7392, abs=1e-4)
    assert v["delay_seconds"] is None
    assert v["is_late"] is None


async def test_response_has_required_top_level_fields(client):
    with (
        patch("app.api.v1.realtime._latest_positions", AsyncMock(return_value=[])),
        patch("app.api.v1.realtime._latest_delays", AsyncMock(return_value={})),
    ):
        resp = await client.get("/api/v1/realtime/vehicles")

    assert resp.status_code == 200
    data = resp.json()
    assert "updated_at" in data
    assert "vehicles" in data
    assert "route_headways" in data
    assert isinstance(data["route_headways"], dict)


async def test_vehicle_with_delay_marked_late(client, a_vehicle):
    with (
        patch("app.api.v1.realtime._latest_positions", AsyncMock(return_value=[a_vehicle])),
        patch("app.api.v1.realtime._latest_delays", AsyncMock(return_value={"T1": 400})),
    ):
        resp = await client.get("/api/v1/realtime/vehicles")

    assert resp.status_code == 200
    v = resp.json()["vehicles"][0]
    assert v["delay_seconds"] == 400
    assert v["is_late"] is True


async def test_vehicle_under_delay_threshold_not_late(client, a_vehicle):
    with (
        patch("app.api.v1.realtime._latest_positions", AsyncMock(return_value=[a_vehicle])),
        patch("app.api.v1.realtime._latest_delays", AsyncMock(return_value={"T1": 100})),
    ):
        resp = await client.get("/api/v1/realtime/vehicles")

    assert resp.status_code == 200
    v = resp.json()["vehicles"][0]
    assert v["delay_seconds"] == 100
    assert v["is_late"] is False


async def test_get_vehicles_by_route_returns_200(client):
    with (
        patch("app.api.v1.realtime._latest_positions", AsyncMock(return_value=[])),
        patch("app.api.v1.realtime._latest_delays", AsyncMock(return_value={})),
    ):
        resp = await client.get("/api/v1/realtime/vehicles/R1")

    assert resp.status_code == 200
    assert resp.json()["vehicles"] == []


async def test_vehicle_without_location_excluded(client):
    no_loc = make_vehicle(lat=None, lon=None)
    with (
        patch("app.api.v1.realtime._latest_positions", AsyncMock(return_value=[no_loc])),
        patch("app.api.v1.realtime._latest_delays", AsyncMock(return_value={})),
    ):
        resp = await client.get("/api/v1/realtime/vehicles")

    data = resp.json()
    assert data["vehicles"] == []
    assert data["vehicles_with_location"] == 0
    assert data["total_vehicles"] == 1


async def test_route_headways_populated(client):
    v1 = make_vehicle(id=1, route_id="R1")
    v2 = make_vehicle(id=2, vehicle_id="V2", route_id="R1")
    with (
        patch("app.api.v1.realtime._latest_positions", AsyncMock(return_value=[v1, v2])),
        patch("app.api.v1.realtime._latest_delays", AsyncMock(return_value={})),
    ):
        resp = await client.get("/api/v1/realtime/vehicles")

    data = resp.json()
    assert "R1" in data["route_headways"]
    assert data["route_headways"]["R1"] == pytest.approx(60.0)

"""Unit tests for the per-IP rate-limit middleware.

Builds a minimal FastAPI app (separate from the main app, where the middleware
is disabled via RATE_LIMIT_ENABLED=false in conftest) so budgets can be
exercised without tripping limits across the rest of the suite.
"""
from __future__ import annotations

import pytest_asyncio
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.middleware.rate_limit import RateLimitMiddleware


def _make_app() -> FastAPI:
    app = FastAPI()

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/api/v1/stats/overview")
    async def overview() -> dict:
        return {}

    @app.get("/api/v1/export/vehicles")
    async def export() -> dict:
        return {}

    app.add_middleware(RateLimitMiddleware)
    return app


@pytest_asyncio.fixture
async def limited_client():
    async with AsyncClient(
        transport=ASGITransport(app=_make_app()), base_url="http://test"
    ) as ac:
        yield ac


async def test_default_bucket_allows_up_to_limit(limited_client):
    for _ in range(120):
        resp = await limited_client.get("/api/v1/stats/overview")
        assert resp.status_code == 200


async def test_default_bucket_429_over_limit(limited_client):
    for _ in range(120):
        await limited_client.get("/api/v1/stats/overview")
    resp = await limited_client.get("/api/v1/stats/overview")
    assert resp.status_code == 429
    assert int(resp.headers["Retry-After"]) >= 1


async def test_export_bucket_is_stricter(limited_client):
    for _ in range(5):
        assert (await limited_client.get("/api/v1/export/vehicles")).status_code == 200
    resp = await limited_client.get("/api/v1/export/vehicles")
    assert resp.status_code == 429


async def test_buckets_are_independent(limited_client):
    for _ in range(6):
        await limited_client.get("/api/v1/export/vehicles")
    # Export budget exhausted; default bucket unaffected.
    resp = await limited_client.get("/api/v1/stats/overview")
    assert resp.status_code == 200


async def test_health_exempt(limited_client):
    for _ in range(150):
        resp = await limited_client.get("/health")
        assert resp.status_code == 200


async def test_forwarded_ips_get_independent_budgets(limited_client):
    for _ in range(6):
        await limited_client.get(
            "/api/v1/export/vehicles", headers={"X-Forwarded-For": "1.1.1.1"}
        )
    resp = await limited_client.get(
        "/api/v1/export/vehicles", headers={"X-Forwarded-For": "2.2.2.2"}
    )
    assert resp.status_code == 200


async def test_rightmost_forwarded_entry_wins(limited_client):
    # Leftmost entries are client-supplied and spoofable; only the rightmost
    # (appended by our own proxy) counts, so varying the left side must NOT
    # grant a fresh budget.
    for i in range(6):
        resp = await limited_client.get(
            "/api/v1/export/vehicles",
            headers={"X-Forwarded-For": f"10.0.0.{i}, 9.9.9.9"},
        )
    assert resp.status_code == 429

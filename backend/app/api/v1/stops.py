"""Stop search and detail endpoints."""
from __future__ import annotations

import csv
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi import Query as QueryParam

from app.api.v1.routes import _gtfs_root, _load_route_stops_index
from app.services.gtfs_decoder import load_gtfs_static_data, TRANSIT_FOLDERS

router = APIRouter(prefix="/stops", tags=["stops"])

_RAIL_FOLDERS = {"light_rail", "op_commuter_rail", "pur_commuter_rail"}


@lru_cache(maxsize=1)
def _build_stop_index() -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    """Build cached indexes for stop search and detail lookups.

    Returns (all_stops, stop_routes):
      all_stops:   {stop_id → {stop_id, stop_name, stop_desc, stop_lat, stop_lon, is_rail}}
      stop_routes: {stop_id → [{route_id, short_name, long_name, color, route_type}]}
    """
    root = _gtfs_root()

    # 1. Load all stops from every GTFS folder, tagging each with is_rail.
    all_stops: dict[str, dict[str, Any]] = {}
    for folder in TRANSIT_FOLDERS:
        is_rail = folder in _RAIL_FOLDERS
        path = root / folder / "stops.txt"
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                sid = row.get("stop_id", "").strip()
                if not sid:
                    continue
                try:
                    lat = float(row.get("stop_lat") or 0.0)
                    lon = float(row.get("stop_lon") or 0.0)
                except (ValueError, TypeError):
                    lat, lon = 0.0, 0.0
                if sid not in all_stops:
                    all_stops[sid] = {
                        "stop_id": sid,
                        "stop_name": row.get("stop_name", "").strip(),
                        "stop_desc": row.get("stop_desc", "").strip(),
                        "stop_lat": lat,
                        "stop_lon": lon,
                        "is_rail": is_rail,
                    }
                elif is_rail and not all_stops[sid]["is_rail"]:
                    # Promote to rail if the same stop also appears in a rail folder.
                    all_stops[sid]["is_rail"] = True

    # 2. Build reverse index: stop_id → list of routes that stop there.
    routes, _ = load_gtfs_static_data(gtfs_static_root=root)
    route_index = _load_route_stops_index()

    stop_routes: dict[str, list[dict[str, Any]]] = {}
    for route_id, stops in route_index.items():
        route = routes.get(route_id, {})
        route_info: dict[str, Any] = {
            "route_id": route_id,
            "short_name": route.get("route_short_name", ""),
            "long_name": route.get("route_long_name", ""),
            "color": route.get("route_color", "888888"),
            "route_type": route.get("route_type", "3"),
        }
        for stop in stops:
            sid = stop["stop_id"]
            if sid not in stop_routes:
                stop_routes[sid] = []
            if not any(r["route_id"] == route_id for r in stop_routes[sid]):
                stop_routes[sid].append(route_info)

    return all_stops, stop_routes


def _format_stop(stop: dict[str, Any], stop_routes: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    return {
        "stop_id": stop["stop_id"],
        "stop_name": stop["stop_name"],
        "stop_desc": stop.get("stop_desc", ""),
        "stop_lat": stop["stop_lat"],
        "stop_lon": stop["stop_lon"],
        "is_rail": stop.get("is_rail", False),
        "routes": stop_routes.get(stop["stop_id"], []),
    }


@router.get("/search")
async def search_stops(
    q: str = QueryParam(..., min_length=2, description="Stop name search query"),
    limit: int = QueryParam(20, ge=1, le=50),
) -> dict:
    """Search stops by name. Returns up to `limit` results sorted by relevance."""
    all_stops, stop_routes = _build_stop_index()
    q_lower = q.lower().strip()

    matches = [s for s in all_stops.values() if q_lower in s["stop_name"].lower()]

    def _rank(s: dict[str, Any]) -> tuple:
        name_lower = s["stop_name"].lower()
        # Starts-with beats contains; rail beats bus; then alphabetical.
        return (
            0 if name_lower.startswith(q_lower) else 1,
            0 if s.get("is_rail") else 1,
            name_lower,
        )

    matches.sort(key=_rank)
    return {
        "query": q,
        "stops": [_format_stop(s, stop_routes) for s in matches[:limit]],
    }


@router.get("/{stop_id}")
async def get_stop(stop_id: str) -> dict:
    """Return details for a specific stop, including every route that serves it."""
    all_stops, stop_routes = _build_stop_index()
    stop = all_stops.get(stop_id)
    if not stop:
        raise HTTPException(status_code=404, detail=f"Stop {stop_id!r} not found")
    return _format_stop(stop, stop_routes)

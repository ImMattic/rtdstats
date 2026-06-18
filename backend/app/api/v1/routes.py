"""GTFS static route / stop info endpoints."""
from __future__ import annotations

import csv
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from app.schemas.vehicle_position import RouteInfo
from app.services.gtfs_decoder import load_gtfs_static_data, TRANSIT_FOLDERS

router = APIRouter(prefix="/routes", tags=["routes"])

_VEHICLE_TYPE_NAMES = {
    "0": "light_rail",
    "1": "heavy_rail",
    "2": "commuter_rail",
    "3": "bus",
}


def _all_routes() -> list[RouteInfo]:
    routes, _ = load_gtfs_static_data(gtfs_static_root=_gtfs_root())
    return [
        RouteInfo(
            route_id=r["route_id"],
            short_name=r.get("route_short_name", ""),
            long_name=r.get("route_long_name", ""),
            route_type=r.get("route_type", ""),
            type_name=_VEHICLE_TYPE_NAMES.get(r.get("route_type", ""), "other"),
            color=r.get("route_color", "888888"),
            agency_id=r.get("agency_id", ""),
        )
        for r in routes.values()
    ]


@router.get("", response_model=dict)
async def list_routes() -> dict:
    return {"routes": [r.model_dump() for r in _all_routes()]}


# ── Rail shapes — must be declared before /{route_id} so FastAPI doesn't
#    interpret the literal string "shapes" as a route_id path parameter. ──────

_RAIL_TYPES = {"0", "1", "2"}


def _gtfs_root() -> Path:
    """Resolve gtfs-static directory for both local dev and Docker container."""
    current = Path(__file__).resolve()
    # Docker mounts it at /app/gtfs-static; locally it sits 4 levels up
    candidates = [Path("/app/gtfs-static"), current.parents[4] / "gtfs-static"]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    # Walk upward as a last resort
    for parent in current.parents:
        candidate = parent / "gtfs-static"
        if candidate.exists():
            return candidate
    return Path("/app/gtfs-static")


@lru_cache(maxsize=1)
def _load_rail_shapes() -> list[dict[str, Any]]:
    """Read GTFS static files once and return rail route shapes.

    Returns a list of::

        {
            "route_id": str,
            "short_name": str,
            "color": str,          # e.g. "#008348"
            "shapes": [
                [[lat, lon], ...],  # one entry per unique shape_id
            ]
        }
    """
    root = _gtfs_root()

    # 1. Collect rail routes
    rail_routes: dict[str, dict[str, Any]] = {}
    for folder in TRANSIT_FOLDERS:
        path = root / folder / "routes.txt"
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                if row.get("route_type", "") not in _RAIL_TYPES:
                    continue
                rid = row.get("route_id", "").strip()
                if rid:
                    color = row.get("route_color", "888888").strip() or "888888"
                    rail_routes[rid] = {
                        "route_id": rid,
                        "short_name": row.get("route_short_name", "").strip(),
                        "color": f"#{color}",
                    }

    # 2. Map route_id → set of shape_ids, and shape_id → folder
    route_shape_ids: dict[str, set[str]] = defaultdict(set)
    shape_id_folder: dict[str, str] = {}
    for folder in TRANSIT_FOLDERS:
        path = root / folder / "trips.txt"
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                rid = row.get("route_id", "").strip()
                sid = row.get("shape_id", "").strip()
                if rid in rail_routes and sid:
                    route_shape_ids[rid].add(sid)
                    shape_id_folder[sid] = folder

    # 3. Load coordinates for each required shape_id
    shape_coords: dict[str, list[list[float]]] = {}
    for folder in TRANSIT_FOLDERS:
        path = root / folder / "shapes.txt"
        if not path.exists():
            continue
        raw: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                sid = row.get("shape_id", "").strip()
                if sid not in shape_id_folder or shape_id_folder[sid] != folder:
                    continue
                try:
                    seq = int(row.get("shape_pt_sequence", 0))
                    lat = float(row.get("shape_pt_lat", 0))
                    lon = float(row.get("shape_pt_lon", 0))
                    raw[sid].append((seq, lat, lon))
                except (ValueError, TypeError):
                    pass
        for sid, pts in raw.items():
            pts.sort(key=lambda p: p[0])
            shape_coords[sid] = [[p[1], p[2]] for p in pts]

    # 4. Assemble result — one entry per rail route, shapes deduplicated
    result: list[dict[str, Any]] = []
    for rid, meta in rail_routes.items():
        shapes = [
            shape_coords[sid]
            for sid in route_shape_ids.get(rid, set())
            if sid in shape_coords
        ]
        if shapes:
            result.append({**meta, "shapes": shapes})

    return result


@router.get("/shapes", response_model=dict)
async def get_rail_shapes() -> dict:
    """Return GeoJSON-like shapes for all RTD rail routes (route_type 0/1/2)."""
    return {"shapes": _load_rail_shapes()}


@router.get("/{route_id}", response_model=dict)
async def get_route(route_id: str) -> dict:
    routes, _ = load_gtfs_static_data()
    r = routes.get(route_id)
    if not r:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Route {route_id!r} not found")
    return RouteInfo(
        route_id=r["route_id"],
        short_name=r.get("route_short_name", ""),
        long_name=r.get("route_long_name", ""),
        route_type=r.get("route_type", ""),
        type_name=_VEHICLE_TYPE_NAMES.get(r.get("route_type", ""), "other"),
        color=r.get("route_color", "888888"),
        agency_id=r.get("agency_id", ""),
    ).model_dump()

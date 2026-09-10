"""Shared multi-route / mode filtering for the analytics and stats endpoints.

The Dashboard filter menu lets a user pick several routes at once, plus
bus / light-rail / commuter-rail quick-selects.  Every affected endpoint takes
the same three query params and funnels them through :func:`resolve_route_ids`,
which flattens them into one ``list[str] | None`` (``None`` == "every route").

Modes resolve to route_ids here via GTFS static ``route_type`` so the SQL layer
only ever has to match a plain id list.
"""
from __future__ import annotations

from app.services.gtfs_decoder import load_gtfs_static_data

# GTFS route_type values behind each mode quick-select. Values match the
# frontend's RouteInfo.type_name vocabulary.
MODE_ROUTE_TYPES: dict[str, set[str]] = {
    "light_rail": {"0"},
    "heavy_rail": {"1"},
    "commuter_rail": {"2"},
    "bus": {"3"},
}


def _split_csv(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def resolve_route_ids(
    route_id: str | None = None,
    route_ids: str | None = None,
    modes: str | None = None,
) -> list[str] | None:
    """Merge the legacy single ``route_id``, an explicit ``route_ids`` CSV, and
    ``modes`` quick-selects into one sorted id list. ``None`` means no route
    restriction (the whole system)."""
    ids: set[str] = set(_split_csv(route_ids))
    if route_id:
        ids.add(route_id)

    wanted_types: set[str] = set()
    for mode in _split_csv(modes):
        wanted_types |= MODE_ROUTE_TYPES.get(mode, set())
    if wanted_types:
        routes_static, _ = load_gtfs_static_data()
        for rid, meta in routes_static.items():
            if str(meta.get("route_type", "")).strip() in wanted_types:
                ids.add(rid)

    return sorted(ids) if ids else None

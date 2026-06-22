#!/usr/bin/env python
"""Import monthly route-level ridership into the ridership_monthly table.

GTFS-RT carries no boarding counts, so real ridership must be loaded out-of-band
from RTD / NTD published data:

  * RTD open-data portal           — https://data.rtd-denver.com/
  * Federal Transit DB (NTD)       — https://www.transit.dot.gov/ntd/data-product/monthly-module-raw-data-release
    (Agency 8006 = Regional Transportation District, Denver)

The importer is column-name tolerant.  It accepts any CSV that has a route, a
month/period, and a boardings/ridership column under common aliases (override
with the CLI flags below).  Rows are upserted on (route_id, month).

Usage (inside the backend container or venv):

    python -m scripts.import_ridership path/to/ridership.csv
    python -m scripts.import_ridership data.csv --route-col Route --month-col Month \\
        --boardings-col Boardings --source "NTD 2026-05"

If no path is given it imports every *.csv under ``gtfs-static/ridership/``.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Iterable

# Allow running as `python backend/scripts/import_ridership.py` too.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.ridership import RidershipMonthly  # noqa: E402

_ROUTE_ALIASES = ("route_id", "route", "route_short_name", "line", "routename")
_MONTH_ALIASES = ("month", "period", "date", "service_month", "yearmonth")
_BOARDINGS_ALIASES = ("boardings", "ridership", "riders", "trips", "passengers", "upt")
_WEEKDAY_ALIASES = ("avg_weekday_boardings", "weekday_boardings", "avg_weekday")


def _pick(fieldnames: list[str], explicit: str | None, aliases: Iterable[str]) -> str | None:
    if explicit:
        return explicit
    lower = {f.lower().strip(): f for f in fieldnames}
    for a in aliases:
        if a in lower:
            return lower[a]
    return None


def _parse_month(value: str) -> date | None:
    """Parse a month from many shapes → first day of that month."""
    v = value.strip()
    if not v:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y/%m", "%m/%Y", "%b %Y", "%B %Y", "%Y%m"):
        try:
            d = datetime.strptime(v, fmt).date()
            return d.replace(day=1)
        except ValueError:
            continue
    return None


def _parse_int(value: str) -> int | None:
    v = value.replace(",", "").strip()
    if not v:
        return None
    try:
        return int(round(float(v)))
    except ValueError:
        return None


def _read_rows(path: Path, args: argparse.Namespace) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames or []
        route_col = _pick(fields, args.route_col, _ROUTE_ALIASES)
        month_col = _pick(fields, args.month_col, _MONTH_ALIASES)
        board_col = _pick(fields, args.boardings_col, _BOARDINGS_ALIASES)
        weekday_col = _pick(fields, args.weekday_col, _WEEKDAY_ALIASES)
        if not (route_col and month_col and board_col):
            raise SystemExit(
                f"{path.name}: could not locate route/month/boardings columns in "
                f"{fields}. Pass --route-col/--month-col/--boardings-col."
            )

        out: list[dict] = []
        for row in reader:
            route_id = (row.get(route_col) or "").strip()
            month = _parse_month(row.get(month_col) or "")
            boardings = _parse_int(row.get(board_col) or "")
            if not route_id or month is None or boardings is None:
                continue
            out.append({
                "route_id": route_id,
                "month": month,
                "boardings": boardings,
                "avg_weekday_boardings": _parse_int(row.get(weekday_col) or "") if weekday_col else None,
                "source": args.source or path.stem,
            })
        return out


async def _upsert(records: list[dict]) -> tuple[int, int]:
    inserted = updated = 0
    async with AsyncSessionLocal() as session:
        for rec in records:
            existing = (await session.execute(
                select(RidershipMonthly).where(
                    RidershipMonthly.route_id == rec["route_id"],
                    RidershipMonthly.month == rec["month"],
                )
            )).scalar_one_or_none()
            if existing:
                existing.boardings = rec["boardings"]
                existing.avg_weekday_boardings = rec["avg_weekday_boardings"]
                existing.source = rec["source"]
                updated += 1
            else:
                session.add(RidershipMonthly(**rec))
                inserted += 1
        await session.commit()
    return inserted, updated


def _resolve_paths(arg_path: str | None) -> list[Path]:
    if arg_path:
        return [Path(arg_path)]
    default_dir = Path(__file__).resolve().parents[2] / "gtfs-static" / "ridership"
    if not default_dir.exists():
        raise SystemExit(
            f"No path given and {default_dir} does not exist. "
            "Drop a CSV there or pass an explicit path."
        )
    return sorted(default_dir.glob("*.csv"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", help="CSV file (default: gtfs-static/ridership/*.csv)")
    parser.add_argument("--route-col")
    parser.add_argument("--month-col")
    parser.add_argument("--boardings-col")
    parser.add_argument("--weekday-col")
    parser.add_argument("--source", help="Provenance label stored on each row")
    args = parser.parse_args()

    paths = _resolve_paths(args.path)
    if not paths:
        raise SystemExit("No CSV files found to import.")

    all_records: list[dict] = []
    for p in paths:
        if not p.exists():
            raise SystemExit(f"File not found: {p}")
        rows = _read_rows(p, args)
        print(f"{p.name}: parsed {len(rows)} ridership rows")
        all_records.extend(rows)

    if not all_records:
        raise SystemExit("Nothing to import (no valid rows parsed).")

    inserted, updated = asyncio.run(_upsert(all_records))
    print(f"Done. Inserted {inserted}, updated {updated} rows.")


if __name__ == "__main__":
    main()

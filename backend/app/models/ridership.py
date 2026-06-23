from __future__ import annotations

from datetime import date

from sqlalchemy import Date, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RidershipMonthly(Base):
    """One row = monthly boardings for a single route.

    Unlike the GTFS-RT hypertables this is a small, plain Postgres table that is
    populated out-of-band from RTD / NTD published ridership data (see
    ``backend/scripts/import_ridership.py``).  GTFS-RT carries no boarding
    counts, so real ridership has to be imported separately; ``occupancy_status``
    on vehicle_positions is only a coarse live crowding proxy.

    Keyed logically on (route_id, month); the importer upserts on that pair.
    """

    __tablename__ = "ridership_monthly"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    route_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # First day of the month the figure covers (e.g. 2026-05-01 for May 2026).
    month: Mapped[date] = mapped_column(Date, nullable=False)

    # Total boardings for the month.
    boardings: Mapped[int] = mapped_column(Integer, nullable=False)
    # Optional average weekday boardings, when the source provides it.
    avg_weekday_boardings: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Free-text provenance label (e.g. "NTD 2026-05", "RTD open data").
    source: Mapped[str | None] = mapped_column(String(128), nullable=True)

    __table_args__ = (
        Index("ix_ridership_route_month", "route_id", "month", unique=True),
    )

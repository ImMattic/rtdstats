from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, Index, Integer, String
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class StopArrivalEvent(Base):
    """One row = one observed arrival of a vehicle at a scheduled timepoint.

    Derived (not fetched): ``services/ontime.py`` geofences each live
    ``vehicle_positions`` snapshot against its trip's static timepoints and,
    when within range, records the observed arrival vs. the scheduled time.
    ``delay_seconds`` is positive when late, negative when early.  This is what
    the on-time continuous aggregates (migration 004) read instead of the
    unreliable ``trip_updates.arrival_delay``.

    TimescaleDB hypertable on *timestamp* (= ``actual_time``).  Dedup on
    (trip_id, stop_sequence, service_date) is done in application code
    (``services/ontime.py`` for live, wipe-and-rebuild for backfill): a
    hypertable can't carry a unique index that omits its partition column, so
    the (trip, stop, date) index below is a plain lookup index, not a
    constraint.
    """

    __tablename__ = "stop_arrival_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    trip_id: Mapped[str] = mapped_column(String(64), nullable=False)
    route_id: Mapped[str] = mapped_column(String(64), nullable=False)
    stop_id: Mapped[str] = mapped_column(String(64), nullable=False)
    stop_sequence: Mapped[int] = mapped_column(Integer, nullable=False)

    scheduled_time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    actual_time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    delay_seconds: Mapped[int] = mapped_column(Integer, nullable=False)

    # GTFS service date the scheduled arrival belongs to (America/Denver).
    service_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Partition key for the hypertable (always equals actual_time).
    timestamp: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)

    __table_args__ = (
        Index(
            "ix_sae_trip_stop_date",
            "trip_id", "stop_sequence", "service_date",
        ),
        Index("ix_sae_route_ts", "route_id", "timestamp"),
    )

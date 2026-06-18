from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Index, Integer, String
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TripUpdate(Base):
    """One row = one stop-time update from the GTFS-RT TripUpdate feed.

    TimescaleDB hypertable on *timestamp* (see migration 001).
    Positive delay = late; negative = early (both in seconds).
    """

    __tablename__ = "trip_updates"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    trip_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    route_id: Mapped[str] = mapped_column(String(64), nullable=False)

    stop_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stop_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)

    arrival_delay: Mapped[int | None] = mapped_column(Integer, nullable=True)
    departure_delay: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Raw predicted unix timestamps from the feed
    arrival_time: Mapped[int | None] = mapped_column(Integer, nullable=True)
    departure_time: Mapped[int | None] = mapped_column(Integer, nullable=True)

    timestamp: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )

    __table_args__ = (
        Index("ix_tu_route_ts", "route_id", "timestamp"),
        Index("ix_tu_trip_stop", "trip_id", "stop_sequence"),
    )

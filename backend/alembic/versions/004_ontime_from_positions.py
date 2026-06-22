"""Rework on-time performance: measure from observed positions, not the feed.

Revision ID: 004
Revises: 003
Create Date: 2026-06-21

RTD's GTFS-RT TripUpdate feed leaves ``arrival.delay`` unset, so the
delay-based on-time aggregates from migration 003 read ~100% on-time (every
unset delay decoded as 0, which lands in the on-time band).  We instead derive
observed arrivals by geofencing live vehicle positions against the static
timepoints (``app/services/ontime.py``) and store one row per arrival in a new
``stop_arrival_events`` hypertable.

This migration:
  * creates ``stop_arrival_events`` (hypertable on ``timestamp``).
  * recreates ``trip_ontime_hourly`` and ``stop_delay_daily`` to read
    ``delay_seconds`` from that table, re-thresholded to the new ±2 min on-time
    definition (with early sub-bands).  Column shapes are unchanged so the
    analytics API/frontend are untouched.

The cagg DDL runs in autocommit_block() (can't run in a transaction), and the
caggs are DROP+recreated rather than altered — same constraints as 002/003.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── New on-time source: observed arrivals (positive delay = late) ────────────
# On-time = within ±120s; early/late split into sub-bands for the distribution.
_ONTIME_HOURLY_FROM_EVENTS = """
    SELECT
        route_id,
        time_bucket(INTERVAL '1 hour', timestamp) AS bucket,
        count(*) FILTER (WHERE delay_seconds < -300)                          AS very_early,
        count(*) FILTER (WHERE delay_seconds >= -300 AND delay_seconds < -120)  AS early,
        count(*) FILTER (WHERE delay_seconds >= -120 AND delay_seconds <= 120)  AS on_time,
        count(*) FILTER (WHERE delay_seconds > 120 AND delay_seconds <= 300)    AS slightly_late,
        count(*) FILTER (WHERE delay_seconds > 300 AND delay_seconds <= 600)    AS late,
        count(*) FILTER (WHERE delay_seconds > 600)                           AS very_late,
        count(delay_seconds)                                                 AS observations,
        sum(delay_seconds)::bigint                                           AS delay_sum,
        sum(delay_seconds::bigint * delay_seconds::bigint)::bigint           AS delay_sumsq
    FROM stop_arrival_events
    GROUP BY route_id, bucket
"""

_STOP_DELAY_DAILY_FROM_EVENTS = """
    SELECT
        route_id,
        stop_id,
        time_bucket(INTERVAL '1 day', timestamp) AS bucket,
        count(*) FILTER (WHERE delay_seconds > 120)                          AS late,
        count(*) FILTER (WHERE delay_seconds >= -120 AND delay_seconds <= 120)  AS on_time,
        count(delay_seconds)                                                 AS observations,
        sum(delay_seconds)::bigint                                           AS delay_sum
    FROM stop_arrival_events
    GROUP BY route_id, stop_id, bucket
"""

# ── Migration-003 forms, recreated verbatim by downgrade() ───────────────────
_ONTIME_HOURLY_V3 = """
    SELECT
        route_id,
        time_bucket(INTERVAL '1 hour', timestamp) AS bucket,
        count(*) FILTER (WHERE arrival_delay < -300)                     AS very_early,
        count(*) FILTER (WHERE arrival_delay >= -300 AND arrival_delay < -60)  AS early,
        count(*) FILTER (WHERE arrival_delay >= -60 AND arrival_delay <= 300)  AS on_time,
        count(*) FILTER (WHERE arrival_delay > 300 AND arrival_delay <= 600)   AS slightly_late,
        count(*) FILTER (WHERE arrival_delay > 600 AND arrival_delay <= 1200)  AS late,
        count(*) FILTER (WHERE arrival_delay > 1200)                     AS very_late,
        count(arrival_delay)                                             AS observations,
        sum(arrival_delay)::bigint                                       AS delay_sum,
        sum(arrival_delay::bigint * arrival_delay::bigint)::bigint       AS delay_sumsq
    FROM trip_updates
    GROUP BY route_id, bucket
"""

_STOP_DELAY_DAILY_V3 = """
    SELECT
        route_id,
        stop_id,
        time_bucket(INTERVAL '1 day', timestamp) AS bucket,
        count(*) FILTER (WHERE arrival_delay > 300)        AS late,
        count(*) FILTER (
            WHERE arrival_delay >= -60 AND arrival_delay <= 300
        )                                                  AS on_time,
        count(arrival_delay)                               AS observations,
        sum(arrival_delay)::bigint                         AS delay_sum
    FROM trip_updates
    WHERE stop_id IS NOT NULL
    GROUP BY route_id, stop_id, bucket
"""


def _create_cagg(name: str, select_sql: str, *, backfill_days: int = 90,
                 start_offset: str, end_offset: str, schedule: str) -> None:
    """Create a continuous aggregate with real-time aggregation, backfill, and a
    refresh policy. Must be called inside an autocommit_block(). (Copied from
    migration 003 — migrations are self-contained.)"""
    op.execute(
        f"CREATE MATERIALIZED VIEW IF NOT EXISTS {name} "
        f"WITH (timescaledb.continuous) AS {select_sql} WITH NO DATA;"
    )
    op.execute(
        f"ALTER MATERIALIZED VIEW {name} "
        f"SET (timescaledb.materialized_only = false);"
    )
    op.execute(
        f"CALL refresh_continuous_aggregate('{name}',"
        f" NOW() - INTERVAL '{backfill_days} days', NOW());"
    )
    op.execute(
        f"SELECT add_continuous_aggregate_policy('{name}',"
        f" start_offset => INTERVAL '{start_offset}',"
        f" end_offset   => INTERVAL '{end_offset}',"
        f" schedule_interval => INTERVAL '{schedule}',"
        f" if_not_exists => TRUE);"
    )


def upgrade() -> None:
    # ── Observed stop-arrival events (hypertable) ────────────────────────────
    op.create_table(
        "stop_arrival_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("trip_id", sa.String(length=64), nullable=False),
        sa.Column("route_id", sa.String(length=64), nullable=False),
        sa.Column("stop_id", sa.String(length=64), nullable=False),
        sa.Column("stop_sequence", sa.Integer(), nullable=False),
        sa.Column("scheduled_time", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("actual_time", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("delay_seconds", sa.Integer(), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("timestamp", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", "timestamp"),
    )
    # Non-unique lookup index — a hypertable can't carry a unique index that
    # omits its partition column, so dedup lives in app code (services/ontime.py
    # for live, wipe-and-rebuild for backfill).
    op.create_index(
        "ix_sae_trip_stop_date", "stop_arrival_events",
        ["trip_id", "stop_sequence", "service_date"],
    )
    op.create_index(
        "ix_sae_route_ts", "stop_arrival_events", ["route_id", "timestamp"],
    )
    op.execute(
        "SELECT create_hypertable('stop_arrival_events', 'timestamp', "
        "chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);"
    )

    with op.get_context().autocommit_block():
        op.execute("DROP MATERIALIZED VIEW IF EXISTS trip_ontime_hourly;")
        _create_cagg(
            "trip_ontime_hourly", _ONTIME_HOURLY_FROM_EVENTS,
            start_offset="3 days", end_offset="1 hour", schedule="1 hour",
        )

        op.execute("DROP MATERIALIZED VIEW IF EXISTS stop_delay_daily;")
        _create_cagg(
            "stop_delay_daily", _STOP_DELAY_DAILY_FROM_EVENTS,
            start_offset="7 days", end_offset="1 hour", schedule="6 hours",
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        # Restore the migration-003 forms (read from trip_updates.arrival_delay).
        op.execute("DROP MATERIALIZED VIEW IF EXISTS trip_ontime_hourly;")
        _create_cagg(
            "trip_ontime_hourly", _ONTIME_HOURLY_V3,
            start_offset="3 days", end_offset="1 hour", schedule="1 hour",
        )
        op.execute("DROP MATERIALIZED VIEW IF EXISTS stop_delay_daily;")
        _create_cagg(
            "stop_delay_daily", _STOP_DELAY_DAILY_V3,
            start_offset="7 days", end_offset="1 hour", schedule="6 hours",
        )

    op.drop_index("ix_sae_route_ts", table_name="stop_arrival_events")
    op.drop_index("ix_sae_trip_stop_date", table_name="stop_arrival_events")
    op.drop_table("stop_arrival_events")

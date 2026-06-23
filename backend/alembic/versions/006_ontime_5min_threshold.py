"""Re-threshold on-time performance to RTD's ±5 min definition.

Revision ID: 006
Revises: 005
Create Date: 2026-06-22

RTD publishes on-time as "within 5 minutes of schedule".  Migration 004 built
``trip_ontime_hourly`` / ``stop_delay_daily`` from observed arrivals with a
±2 min (±120s) on-time band.  This migration recreates both continuous
aggregates with a ±5 min (±300s) on-time band, shifting the early/late
sub-bands out accordingly so they stay mutually exclusive:

    very_early  < -10m            (< -600s)
    early       -10m .. -5m       (-600s .. -300s)
    on_time     ±5m               (-300s .. 300s)
    slightly    +5m .. +10m       (300s .. 600s)
    late        +10m .. +15m      (600s .. 900s)
    very_late   > +15m            (> 900s)

Column shapes are unchanged, so the analytics API / frontend are untouched.
The cagg DDL runs in autocommit_block() (can't run in a transaction) and the
caggs are DROP+recreated rather than altered — same constraints as 002/003/004.
The downgrade restores migration 004's ±2 min forms verbatim.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── New ±5 min on-time bands (positive delay = late) ─────────────────────────
_ONTIME_HOURLY_5MIN = """
    SELECT
        route_id,
        time_bucket(INTERVAL '1 hour', timestamp) AS bucket,
        count(*) FILTER (WHERE delay_seconds < -600)                          AS very_early,
        count(*) FILTER (WHERE delay_seconds >= -600 AND delay_seconds < -300)  AS early,
        count(*) FILTER (WHERE delay_seconds >= -300 AND delay_seconds <= 300)  AS on_time,
        count(*) FILTER (WHERE delay_seconds > 300 AND delay_seconds <= 600)    AS slightly_late,
        count(*) FILTER (WHERE delay_seconds > 600 AND delay_seconds <= 900)    AS late,
        count(*) FILTER (WHERE delay_seconds > 900)                           AS very_late,
        count(delay_seconds)                                                 AS observations,
        sum(delay_seconds)::bigint                                           AS delay_sum,
        sum(delay_seconds::bigint * delay_seconds::bigint)::bigint           AS delay_sumsq
    FROM stop_arrival_events
    GROUP BY route_id, bucket
"""

_STOP_DELAY_DAILY_5MIN = """
    SELECT
        route_id,
        stop_id,
        time_bucket(INTERVAL '1 day', timestamp) AS bucket,
        count(*) FILTER (WHERE delay_seconds > 300)                          AS late,
        count(*) FILTER (WHERE delay_seconds >= -300 AND delay_seconds <= 300)  AS on_time,
        count(delay_seconds)                                                 AS observations,
        sum(delay_seconds)::bigint                                           AS delay_sum
    FROM stop_arrival_events
    GROUP BY route_id, stop_id, bucket
"""

# ── Migration-004 ±2 min forms, recreated verbatim by downgrade() ────────────
_ONTIME_HOURLY_V4 = """
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

_STOP_DELAY_DAILY_V4 = """
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


def _create_cagg(name: str, select_sql: str, *, backfill_days: int = 90,
                 start_offset: str, end_offset: str, schedule: str) -> None:
    """Create a continuous aggregate with real-time aggregation, backfill, and a
    refresh policy. Must be called inside an autocommit_block(). (Copied from
    migration 004 — migrations are self-contained.)"""
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
    with op.get_context().autocommit_block():
        op.execute("DROP MATERIALIZED VIEW IF EXISTS trip_ontime_hourly;")
        _create_cagg(
            "trip_ontime_hourly", _ONTIME_HOURLY_5MIN,
            start_offset="3 days", end_offset="1 hour", schedule="1 hour",
        )

        op.execute("DROP MATERIALIZED VIEW IF EXISTS stop_delay_daily;")
        _create_cagg(
            "stop_delay_daily", _STOP_DELAY_DAILY_5MIN,
            start_offset="7 days", end_offset="1 hour", schedule="6 hours",
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP MATERIALIZED VIEW IF EXISTS trip_ontime_hourly;")
        _create_cagg(
            "trip_ontime_hourly", _ONTIME_HOURLY_V4,
            start_offset="3 days", end_offset="1 hour", schedule="1 hour",
        )
        op.execute("DROP MATERIALIZED VIEW IF EXISTS stop_delay_daily;")
        _create_cagg(
            "stop_delay_daily", _STOP_DELAY_DAILY_V4,
            start_offset="7 days", end_offset="1 hour", schedule="6 hours",
        )

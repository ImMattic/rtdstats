"""Analytics aggregates: richer on-time cagg, stop/occupancy/trip-activity
continuous aggregates, and a monthly ridership table.

Revision ID: 003
Revises: 002
Create Date: 2026-06-20

Powers the rebuilt Dashboard / Historical analytics:
  * trip_ontime_hourly is recreated with fine-grained delay bins + delay_sumsq
    so one rollup drives the on-time trend, hour×dow heatmap, delay
    distribution, and consistency (stddev) widgets.
  * stop_delay_daily   → worst stops / segments by delay.
  * occupancy_hourly   → live crowding (occupancy_status) proxy over time.
  * trip_activity_daily→ distinct trips observed per day (service delivery /
    "ghost trip" detection vs the static schedule).
  * ridership_monthly  → imported real boardings (GTFS-RT has none).

All continuous-aggregate DDL runs inside autocommit_block() because it cannot
execute inside a transaction (same constraint as migration 002).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Fine-grained delay bins (seconds). Non-overlapping; together they cover every
# row with a non-null arrival_delay. on_time keeps the migration-002 definition
# (-60..300) so the dashboard's headline number is unchanged.
_ONTIME_HOURLY_SELECT = """
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

# Migration-002 definition, recreated verbatim by downgrade().
_ONTIME_HOURLY_SELECT_V2 = """
    SELECT
        route_id,
        time_bucket(INTERVAL '1 hour', timestamp) AS bucket,
        count(*) FILTER (WHERE arrival_delay > 300)        AS late,
        count(*) FILTER (WHERE arrival_delay < -60)        AS early,
        count(*) FILTER (
            WHERE arrival_delay >= -60 AND arrival_delay <= 300
        )                                                  AS on_time,
        count(arrival_delay)                               AS observations,
        sum(arrival_delay)::bigint                         AS delay_sum
    FROM trip_updates
    GROUP BY route_id, bucket
"""


def _create_cagg(name: str, select_sql: str, *, backfill_days: int = 90,
                 start_offset: str, end_offset: str, schedule: str) -> None:
    """Create a continuous aggregate with real-time aggregation, backfill, and
    a refresh policy. Must be called inside an autocommit_block()."""
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
    # ── Ridership (plain table; imported out-of-band) ────────────────────────
    op.create_table(
        "ridership_monthly",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("route_id", sa.String(length=64), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("boardings", sa.Integer(), nullable=False),
        sa.Column("avg_weekday_boardings", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=128), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ridership_route_month", "ridership_monthly",
        ["route_id", "month"], unique=True,
    )

    with op.get_context().autocommit_block():
        # ── Recreate trip_ontime_hourly with richer bins + sumsq ─────────────
        op.execute("DROP MATERIALIZED VIEW IF EXISTS trip_ontime_hourly;")
        _create_cagg(
            "trip_ontime_hourly", _ONTIME_HOURLY_SELECT,
            start_offset="3 days", end_offset="1 hour", schedule="1 hour",
        )

        # ── Stop-level daily delay rollup (worst stops/segments) ─────────────
        _create_cagg(
            "stop_delay_daily",
            """
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
            """,
            start_offset="7 days", end_offset="1 hour", schedule="6 hours",
        )

        # ── Occupancy / crowding hourly distribution ─────────────────────────
        # occupancy_status is the GTFS-RT enum name; bucket into demand levels.
        _create_cagg(
            "occupancy_hourly",
            """
            SELECT
                route_id,
                time_bucket(INTERVAL '1 hour', timestamp) AS bucket,
                count(*) FILTER (
                    WHERE occupancy_status IN ('EMPTY', 'MANY_SEATS_AVAILABLE')
                )                                                  AS low,
                count(*) FILTER (
                    WHERE occupancy_status = 'FEW_SEATS_AVAILABLE'
                )                                                  AS medium,
                count(*) FILTER (
                    WHERE occupancy_status IN (
                        'STANDING_ROOM_ONLY', 'CRUSHED_STANDING_ROOM_ONLY',
                        'FULL', 'NOT_ACCEPTING_PASSENGERS'
                    )
                )                                                  AS high,
                count(*) FILTER (
                    WHERE occupancy_status IS NULL
                       OR occupancy_status = 'UNKNOWN'
                )                                                  AS unknown,
                count(*)                                           AS samples
            FROM vehicle_positions
            GROUP BY route_id, bucket
            """,
            start_offset="3 days", end_offset="1 hour", schedule="1 hour",
        )

        # ── Trip activity (distinct trips observed) per day ──────────────────
        # COUNT(DISTINCT) is unsupported in caggs, so we key by trip_id and
        # count rows per route/day at query time to get distinct trips.
        _create_cagg(
            "trip_activity_daily",
            """
            SELECT
                route_id,
                trip_id,
                time_bucket(INTERVAL '1 day', timestamp) AS bucket,
                count(*)                                  AS observations
            FROM vehicle_positions
            WHERE trip_id IS NOT NULL
            GROUP BY route_id, trip_id, bucket
            """,
            start_offset="7 days", end_offset="1 hour", schedule="6 hours",
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP MATERIALIZED VIEW IF EXISTS trip_activity_daily;")
        op.execute("DROP MATERIALIZED VIEW IF EXISTS occupancy_hourly;")
        op.execute("DROP MATERIALIZED VIEW IF EXISTS stop_delay_daily;")

        # Restore the migration-002 form of trip_ontime_hourly.
        op.execute("DROP MATERIALIZED VIEW IF EXISTS trip_ontime_hourly;")
        _create_cagg(
            "trip_ontime_hourly", _ONTIME_HOURLY_SELECT_V2,
            start_offset="3 days", end_offset="1 hour", schedule="1 hour",
        )

    op.drop_index("ix_ridership_route_month", table_name="ridership_monthly")
    op.drop_table("ridership_monthly")

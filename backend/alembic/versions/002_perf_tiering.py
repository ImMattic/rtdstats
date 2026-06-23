"""Performance tiering: hot/cold storage via compression, 1-year retention,
an on-time continuous aggregate, and a trip_id/timestamp index.

Revision ID: 002
Revises: 001
Create Date: 2026-06-20

Design (hot/cold):
  * Recent chunks stay uncompressed ("hot") — fast 10 s inserts + fast live reads.
  * Chunks older than 1 day get TimescaleDB columnar compression ("cold") —
    ~90% smaller and faster to scan for the Historical tab.
  * Raw rows are dropped after 1 year (retention).
  * The dashboard's on-time query reads a small hourly continuous aggregate
    instead of millions of raw trip_updates rows.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES = ("vehicle_positions", "trip_updates")


def upgrade() -> None:
    # ── Missing index: latest delay per trip lookups (realtime + historical) ──
    op.create_index("ix_tu_trip_ts", "trip_updates", ["trip_id", "timestamp"])

    # ── Smaller chunks going forward → smaller hot working set on a 4 GB VM ──
    # (Only affects chunks created after this migration; existing ones keep 1 day.)
    for table in _TABLES:
        op.execute(
            f"SELECT set_chunk_time_interval('{table}', INTERVAL '12 hours');"
        )

    # ── Enable columnar compression (cold storage) ───────────────────────────
    # Segment by route_id so analytical scans that filter/group by route skip
    # irrelevant segments; order by timestamp DESC for time-range scans.
    op.execute(
        "ALTER TABLE vehicle_positions SET ("
        "timescaledb.compress, "
        "timescaledb.compress_segmentby = 'route_id', "
        "timescaledb.compress_orderby = 'timestamp DESC');"
    )
    op.execute(
        "ALTER TABLE trip_updates SET ("
        "timescaledb.compress, "
        "timescaledb.compress_segmentby = 'route_id', "
        "timescaledb.compress_orderby = 'timestamp DESC');"
    )

    # Compress chunks once they fall out of the 1-day "hot" window. Inserts only
    # ever touch the current chunk, so live ingestion is unaffected.
    for table in _TABLES:
        op.execute(
            f"SELECT add_compression_policy('{table}', INTERVAL '1 day', "
            f"if_not_exists => TRUE);"
        )

    # ── Retention: keep 1 year of raw data for the Historical tab ────────────
    for table in _TABLES:
        op.execute(
            f"SELECT add_retention_policy('{table}', INTERVAL '365 days', "
            f"if_not_exists => TRUE);"
        )

    # ── On-time continuous aggregate (dashboard cold path) ───────────────────
    # Creating a continuous aggregate + its policy cannot run inside a
    # transaction, so step outside Alembic's transaction with autocommit_block().
    with op.get_context().autocommit_block():
        op.execute(
            """
            CREATE MATERIALIZED VIEW IF NOT EXISTS trip_ontime_hourly
            WITH (timescaledb.continuous) AS
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
            WITH NO DATA;
            """
        )
        # Show the most recent (not-yet-materialized) hour via real-time aggregation.
        op.execute(
            "ALTER MATERIALIZED VIEW trip_ontime_hourly "
            "SET (timescaledb.materialized_only = false);"
        )
        # Backfill the last 90 days so the dashboard has recent data immediately.
        # Older buckets fill in as the hourly policy runs; real-time aggregation
        # covers the current hour. A full NULL,NULL backfill blocks migration
        # startup for many minutes on large tables.
        op.execute(
            "CALL refresh_continuous_aggregate('trip_ontime_hourly',"
            " NOW() - INTERVAL '90 days', NOW());"
        )
        # Going forward: re-materialize the recent window hourly; the last hour is
        # covered by real-time aggregation, older buckets stay from the backfill.
        op.execute(
            """
            SELECT add_continuous_aggregate_policy('trip_ontime_hourly',
                start_offset => INTERVAL '3 days',
                end_offset   => INTERVAL '1 hour',
                schedule_interval => INTERVAL '1 hour',
                if_not_exists => TRUE);
            """
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP MATERIALIZED VIEW IF EXISTS trip_ontime_hourly;")

    for table in _TABLES:
        op.execute(f"SELECT remove_retention_policy('{table}', if_exists => TRUE);")
        op.execute(f"SELECT remove_compression_policy('{table}', if_exists => TRUE);")

    # Decompress all chunks before disabling compression. The second arg
    # (if_compressed => true) makes already-uncompressed chunks a no-op.
    for table in _TABLES:
        op.execute(
            f"SELECT decompress_chunk(c, true) FROM show_chunks('{table}') c;"
        )
    op.execute("ALTER TABLE vehicle_positions SET (timescaledb.compress = false);")
    op.execute("ALTER TABLE trip_updates SET (timescaledb.compress = false);")

    op.drop_index("ix_tu_trip_ts", table_name="trip_updates")

"""Initial schema: vehicle_positions + trip_updates TimescaleDB hypertables.

Revision ID: 001
Revises:
Create Date: 2026-06-17

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── vehicle_positions ──────────────────────────────────────────────────
    op.create_table(
        "vehicle_positions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("trip_id", sa.String(length=64), nullable=True),
        sa.Column("route_id", sa.String(length=64), nullable=False),
        sa.Column("vehicle_id", sa.String(length=64), nullable=True),
        sa.Column("vehicle_label", sa.String(length=64), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("bearing", sa.Float(), nullable=True),
        sa.Column("current_stop_sequence", sa.Integer(), nullable=True),
        sa.Column("current_status", sa.Integer(), nullable=True),
        sa.Column("stop_id", sa.String(length=64), nullable=True),
        sa.Column("occupancy_status", sa.String(length=48), nullable=True),
        sa.Column(
            "timestamp",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", "timestamp"),
    )
    op.create_index("ix_vp_route_ts", "vehicle_positions", ["route_id", "timestamp"])
    op.create_index("ix_vp_vehicle_ts", "vehicle_positions", ["vehicle_id", "timestamp"])

    # Convert to TimescaleDB hypertable (requires TimescaleDB extension)
    op.execute(
        "SELECT create_hypertable('vehicle_positions', 'timestamp', "
        "chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);"
    )

    # ── trip_updates ───────────────────────────────────────────────────────
    op.create_table(
        "trip_updates",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("trip_id", sa.String(length=64), nullable=True),
        sa.Column("route_id", sa.String(length=64), nullable=False),
        sa.Column("stop_id", sa.String(length=64), nullable=True),
        sa.Column("stop_sequence", sa.Integer(), nullable=True),
        sa.Column("arrival_delay", sa.Integer(), nullable=True),
        sa.Column("departure_delay", sa.Integer(), nullable=True),
        sa.Column("arrival_time", sa.Integer(), nullable=True),
        sa.Column("departure_time", sa.Integer(), nullable=True),
        sa.Column(
            "timestamp",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", "timestamp"),
    )
    op.create_index("ix_tu_route_ts", "trip_updates", ["route_id", "timestamp"])
    op.create_index("ix_tu_trip_stop", "trip_updates", ["trip_id", "stop_sequence"])

    op.execute(
        "SELECT create_hypertable('trip_updates', 'timestamp', "
        "chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);"
    )


def downgrade() -> None:
    op.drop_table("trip_updates")
    op.drop_table("vehicle_positions")

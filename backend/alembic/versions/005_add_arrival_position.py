"""Add actual_lat, actual_lon, actual_bearing to stop_arrival_events.

Revision ID: 005
Revises: 004
Create Date: 2026-06-22

The route-corridor on-time detection (migration 004 + ontime.py rewrite) now
records where the vehicle actually was when the arrival was detected, not just
the stop coordinates.  These three nullable columns enable the trip-detail
frontend to render the live-map vehicle icon at the exact detected position
when the user hovers over a stop row.

All three are nullable so existing rows (pre-migration) keep their NULL values
without requiring a backfill.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stop_arrival_events",
        sa.Column("actual_lat", sa.Float(), nullable=True),
    )
    op.add_column(
        "stop_arrival_events",
        sa.Column("actual_lon", sa.Float(), nullable=True),
    )
    op.add_column(
        "stop_arrival_events",
        sa.Column("actual_bearing", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stop_arrival_events", "actual_bearing")
    op.drop_column("stop_arrival_events", "actual_lon")
    op.drop_column("stop_arrival_events", "actual_lat")

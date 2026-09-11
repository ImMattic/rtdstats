"""Add detection_method to stop_arrival_events.

Revision ID: 007
Revises: 006
Create Date: 2026-09-11

Arrivals used to be uniform: every row meant "the vehicle was seen inside the
timepoint's geofence".  The terminus fallback (services/ontime.py) breaks that
by design — when a trip's feed cuts out short of its last stop, the closest
approach inside a much wider circle is recorded instead, which is a lower bound
rather than a measurement.  This column says which rule wrote each row so the
looser ones stay visible instead of blending into the on-time history.

Nullable, no backfill: rows written before this migration carry NULL, which
reads as "geofence or interpolation, method not recorded".
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stop_arrival_events",
        sa.Column("detection_method", sa.String(length=24), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stop_arrival_events", "detection_method")

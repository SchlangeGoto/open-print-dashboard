"""add filament.series and spool.request_id

Revision ID: g4f1a8c3d7e9
Revises: f2d0e6b9c3a4

The white Support SKUs share brand/material/colour, so the barcode fallback
needs the catalog series to avoid collapsing W/G/ABS. Scan and confirm also
need a client idempotency key so a timed-out retry does not add a second spool.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g4f1a8c3d7e9"
down_revision: str | Sequence[str] | None = "f2d0e6b9c3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "filament",
        sa.Column("series", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "spool",
        sa.Column("request_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "uq_spool_request_id", "spool", ["request_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("uq_spool_request_id", table_name="spool")
    op.drop_column("spool", "request_id")
    op.drop_column("filament", "series")

"""add spool.remaining_unknown

Revision ID: d9a3b7c2e6f8
Revises: c8f2a6b1d5e7

The AMS sometimes sees an RFID spool but reports no remaining percentage.
Storing 0 g or a full 1000 g invents data; record that the weight is unknown
instead and keep the nominal capacity in remaining_g as a placeholder.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d9a3b7c2e6f8"
down_revision: str | Sequence[str] | None = "c8f2a6b1d5e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "spool",
        sa.Column(
            "remaining_unknown",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("spool", "remaining_unknown")

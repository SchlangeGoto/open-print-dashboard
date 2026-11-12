"""add print_job.filament_deducted_at

Revision ID: a6d0e4f8b3c5
Revises: f5c9d3e7a2b4

Records when filament was subtracted for a print. A repeated finish event
(e.g. FAILED followed by FINISH for the same task) must not deduct again.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a6d0e4f8b3c5"
down_revision: str | Sequence[str] | None = "f5c9d3e7a2b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "printjob",
        sa.Column(
            "filament_deducted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("printjob", "filament_deducted_at")

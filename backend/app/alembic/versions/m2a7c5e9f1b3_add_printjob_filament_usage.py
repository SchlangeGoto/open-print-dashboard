"""add printjob filament usage

Revision ID: m2a7c5e9f1b3
Revises: l1f6b4c8e2d7

A multi-colour print consumes more than one filament. Persist the per-filament
weights and costs so statistics can attribute them correctly.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "m2a7c5e9f1b3"
down_revision: str | Sequence[str] | None = "l1f6b4c8e2d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "printjob",
        sa.Column(
            "filament_usage",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("printjob", "filament_usage")

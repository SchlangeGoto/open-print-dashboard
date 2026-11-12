"""add printjob deduction spools

Revision ID: l1f6b4c8e2d7
Revises: k9e5a3b7d1f4

A delayed retry must deduct from the rolls resolved at finish, not from the
tray tags that happen to be loaded hours later.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "l1f6b4c8e2d7"
down_revision: str | Sequence[str] | None = "k9e5a3b7d1f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "printjob",
        sa.Column(
            "deduction_spools",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("printjob", "deduction_spools")

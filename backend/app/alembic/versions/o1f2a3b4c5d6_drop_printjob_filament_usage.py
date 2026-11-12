"""drop the printjob filament usage mirror

Revision ID: o1f2a3b4c5d6
Revises: n3b8d6f2a4c9

The per-filament usage table is the source of truth; the JSON column was a
temporary mirror and is no longer read anywhere.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "o1f2a3b4c5d6"
down_revision: str | Sequence[str] | None = "n3b8d6f2a4c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("printjob", "filament_usage")


def downgrade() -> None:
    op.add_column(
        "printjob",
        sa.Column(
            "filament_usage",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=True,
        ),
    )

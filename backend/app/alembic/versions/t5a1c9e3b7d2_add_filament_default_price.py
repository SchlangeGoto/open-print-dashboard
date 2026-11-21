"""add filament default price

Revision ID: t5a1c9e3b7d2
Revises: s4e2b8f1c6a7
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "t5a1c9e3b7d2"
down_revision: str | Sequence[str] | None = "s4e2b8f1c6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "filament",
        sa.Column("default_price_per_kg", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("filament", "default_price_per_kg")

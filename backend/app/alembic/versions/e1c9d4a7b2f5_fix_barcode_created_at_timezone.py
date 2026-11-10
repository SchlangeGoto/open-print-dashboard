"""fix filamentbarcode.created_at timezone

Revision ID: e1c9d4a7b2f5
Revises: d9a3b7c2e6f8

The barcode onboarding migration used a naive TIMESTAMP while every other
created_at column is TIMESTAMP WITH TIME ZONE. Align it so autogenerate is
clean.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e1c9d4a7b2f5"
down_revision: str | Sequence[str] | None = "d9a3b7c2e6f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "filamentbarcode",
        "created_at",
        type_=sa.DateTime(timezone=True),
        existing_type=sa.DateTime(),
        existing_nullable=True,
        postgresql_using="created_at AT TIME ZONE 'UTC'",
    )


def downgrade() -> None:
    op.alter_column(
        "filamentbarcode",
        "created_at",
        type_=sa.DateTime(),
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=True,
    )

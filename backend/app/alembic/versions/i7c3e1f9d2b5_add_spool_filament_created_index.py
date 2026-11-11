"""add spool filament id index

Revision ID: i7c3e1f9d2b5
Revises: h6b2d9e4c8f1

The filaments list groups and windows by spool.filament_id, ordered by
created_at inside each filament.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "i7c3e1f9d2b5"
down_revision: str | Sequence[str] | None = "h6b2d9e4c8f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_spool_filament_created",
        "spool",
        ["filament_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_spool_filament_created", table_name="spool")

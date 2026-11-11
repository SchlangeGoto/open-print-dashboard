"""replace the spool filament index with a composite one

Revision ID: k9e5a3b7d1f4
Revises: j8d4f2a6c9e1

The filaments list groups by filament_id and orders by created_at inside each
filament. A (filament_id, created_at) index serves both. IF EXISTS also
repairs databases that applied the earlier index revision before it was
replaced.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "k9e5a3b7d1f4"
down_revision: str | Sequence[str] | None = "j8d4f2a6c9e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_spool_filament_id")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_spool_filament_created "
        "ON spool (filament_id, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_spool_filament_created")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_spool_filament_id ON spool (filament_id)"
    )

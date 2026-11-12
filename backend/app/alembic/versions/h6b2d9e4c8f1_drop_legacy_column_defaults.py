"""drop legacy server defaults

Revision ID: h6b2d9e4c8f1
Revises: g4f1a8c3d7e9

The defaults were only needed to backfill rows when the columns were added.
Keeping them lets inserts silently use 1000 g or "known weight" when the
application forgot to send a value. The models still supply the intended
values, so remove the database-side fallbacks.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "h6b2d9e4c8f1"
down_revision: str | Sequence[str] | None = "g4f1a8c3d7e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("filament", "spool_weight_g", server_default=None)
    op.alter_column("spool", "remaining_unknown", server_default=None)


def downgrade() -> None:
    op.alter_column("filament", "spool_weight_g", server_default="1000")
    op.alter_column("spool", "remaining_unknown", server_default=sa.false())

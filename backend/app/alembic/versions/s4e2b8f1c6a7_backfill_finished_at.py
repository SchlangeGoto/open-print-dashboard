"""backfill finished_at for legacy terminal print jobs

Revision ID: s4e2b8f1c6a7
Revises: o1f2a3b4c5d6
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "s4e2b8f1c6a7"
down_revision: str | Sequence[str] | None = "o1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Older rows can be finished/cancelled with a NULL finished_at. They fall
    # out of /prints/stats and the deduction retry window. The new writer no
    # longer creates this state.
    op.execute(
        sa.text(
            "UPDATE printjob "
            "SET finished_at = COALESCE(start_time, created_at, now()) "
            "WHERE status IN (2, 3) AND finished_at IS NULL"
        )
    )


def downgrade() -> None:
    # The backfilled timestamp is indistinguishable from a real one and is
    # required by the corrected data model. Keep it.
    pass

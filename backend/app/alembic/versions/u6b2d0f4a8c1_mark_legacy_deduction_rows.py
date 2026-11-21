"""mark legacy deduction rows without roll identity

Revision ID: u6b2d0f4a8c1
Revises: t5a1c9e3b7d2
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "u6b2d0f4a8c1"
down_revision: str | Sequence[str] | None = "t5a1c9e3b7d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # s4e2b8f1c6a7 gave legacy finished rows a finished_at, which also makes
    # them eligible for the deduction retry. Rows that only have an AMS
    # mapping, but neither the spool recorded at start nor the per-slot map
    # saved at finish, have no roll identity. Resolving those historical
    # slots against the trays loaded today can charge replacement rolls, so
    # mark them terminal and let the retry/report paths skip them.
    op.execute(
        sa.text(
            "UPDATE printjob "
            "SET finish_state = 'LEGACY' "
            "WHERE status IN (2, 3) "
            "AND filament_deducted_at IS NULL "
            "AND ams_detail_mapping IS NOT NULL "
            "AND spool_id IS NULL "
            "AND (deduction_spools IS NULL "
            "     OR deduction_spools IN ('', '{}', 'null')) "
            "AND COALESCE(finish_state, '') NOT IN ('ABANDONED', 'LEGACY')"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE printjob SET finish_state = NULL WHERE finish_state = 'LEGACY'"
        )
    )

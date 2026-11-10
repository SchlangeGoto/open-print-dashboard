"""make spool.tag_uid unique

Revision ID: b8e2f4a6c1d3
Revises: f4c1a8d2e6b7

Overlapping AMS syncs could insert two spools for the same RFID tag. Keep the
oldest spool per tag, clear the duplicates, then enforce uniqueness.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8e2f4a6c1d3"
down_revision: str | Sequence[str] | None = "f4c1a8d2e6b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE spool SET tag_uid = NULL
            WHERE tag_uid IS NOT NULL AND id NOT IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY tag_uid ORDER BY created_at, id
                    ) AS rn
                    FROM spool WHERE tag_uid IS NOT NULL
                ) ranked WHERE ranked.rn = 1
            )
            """
        )
    )
    op.drop_index("ix_spool_tag_uid", table_name="spool")
    op.create_index("ix_spool_tag_uid", "spool", ["tag_uid"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_spool_tag_uid", table_name="spool")
    op.create_index("ix_spool_tag_uid", "spool", ["tag_uid"], unique=False)

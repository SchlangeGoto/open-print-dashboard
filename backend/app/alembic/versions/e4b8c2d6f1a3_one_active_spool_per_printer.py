"""one active spool per printer

Revision ID: e4b8c2d6f1a3
Revises: d3a7c1e9f5b2

``spool.active`` and ``spool.printer_id`` were two sources of truth. Keep the
newest active spool per printer, unload the rest, then enforce it with a
partial unique index.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e4b8c2d6f1a3"
down_revision: str | Sequence[str] | None = "d3a7c1e9f5b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE spool SET active = false, printer_id = NULL
            WHERE active AND printer_id IS NOT NULL AND id NOT IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY printer_id
                        ORDER BY created_at DESC NULLS LAST, id
                    ) AS rn
                    FROM spool WHERE active AND printer_id IS NOT NULL
                ) ranked WHERE ranked.rn = 1
            )
            """
        )
    )
    op.create_index(
        "uq_spool_active_printer",
        "spool",
        ["printer_id"],
        unique=True,
        postgresql_where=sa.text("active"),
    )


def downgrade() -> None:
    op.drop_index("uq_spool_active_printer", table_name="spool")

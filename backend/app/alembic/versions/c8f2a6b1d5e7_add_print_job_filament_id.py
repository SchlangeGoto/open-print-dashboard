"""add printjob.filament_id

Revision ID: c8f2a6b1d5e7
Revises: b7e1f5a9c4d6

Filament statistics used to join through spool, so deleting a spool erased its
print count, used weight and cost from history. Store the filament on the job
itself and backfill rows whose spool still exists.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8f2a6b1d5e7"
down_revision: str | Sequence[str] | None = "b7e1f5a9c4d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("printjob", sa.Column("filament_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "printjob_filament_id_fkey",
        "printjob",
        "filament",
        ["filament_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_printjob_filament_id", "printjob", ["filament_id"], unique=False
    )
    op.execute(
        """
        UPDATE printjob
        SET filament_id = spool.filament_id
        FROM spool
        WHERE printjob.spool_id = spool.id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_printjob_filament_id", table_name="printjob")
    op.drop_constraint("printjob_filament_id_fkey", "printjob", type_="foreignkey")
    op.drop_column("printjob", "filament_id")

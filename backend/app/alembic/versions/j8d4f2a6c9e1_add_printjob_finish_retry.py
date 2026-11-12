"""add printjob finish retry state

Revision ID: j8d4f2a6c9e1
Revises: i7c3e1f9d2b5

A finish can be observed before the cloud task or AMS state is available.
Persist that request so it can be retried after a restart and bounded.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "j8d4f2a6c9e1"
down_revision: str | Sequence[str] | None = "i7c3e1f9d2b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "printjob",
        sa.Column(
            "finish_requested_at",
            sqlmodel.sql.sqltypes.UTCDateTime(),
            nullable=True,
        ),
    )
    op.add_column(
        "printjob",
        sa.Column(
            "finish_attempts", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "printjob",
        sa.Column("finish_state", sa.String(length=10), nullable=True),
    )
    op.alter_column("printjob", "finish_attempts", server_default=None)


def downgrade() -> None:
    op.drop_column("printjob", "finish_state")
    op.drop_column("printjob", "finish_attempts")
    op.drop_column("printjob", "finish_requested_at")

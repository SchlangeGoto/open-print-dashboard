"""add push tokens

Revision ID: v7c3e1f9b2d5
Revises: u6b2d0f4a8c1
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlmodel import UTCDateTime

revision: str = "v7c3e1f9b2d5"
down_revision: str | Sequence[str] | None = "u6b2d0f4a8c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pushtoken",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=20), nullable=False),
        sa.Column("created_at", UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pushtoken_user_id", "pushtoken", ["user_id"])
    op.create_index("ix_pushtoken_token", "pushtoken", ["token"], unique=True)
    op.add_column("printjob", sa.Column("notified_at", UTCDateTime(), nullable=True))
    op.execute(
        sa.text(
            "UPDATE printjob SET notified_at = now() "
            "WHERE status IN (2, 3) AND notified_at IS NULL"
        )
    )


def downgrade() -> None:
    op.drop_column("printjob", "notified_at")
    op.drop_index("ix_pushtoken_token", table_name="pushtoken")
    op.drop_index("ix_pushtoken_user_id", table_name="pushtoken")
    op.drop_table("pushtoken")

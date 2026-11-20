"""add the tenant audit log

Revision ID: q2c9f1d6b8e4
Revises: p1b9e7c3a5d2
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "q2c9f1d6b8e4"
down_revision: str | Sequence[str] | None = "p1b9e7c3a5d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "auditlog",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "action", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False
        ),
        sa.Column(
            "target", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True
        ),
        sa.Column("details", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column(
            "created_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auditlog_tenant_id", "auditlog", ["tenant_id"])
    op.create_index("ix_auditlog_user_id", "auditlog", ["user_id"])
    op.create_index("ix_auditlog_action", "auditlog", ["action"])


def downgrade() -> None:
    op.drop_index("ix_auditlog_action", table_name="auditlog")
    op.drop_index("ix_auditlog_user_id", table_name="auditlog")
    op.drop_index("ix_auditlog_tenant_id", table_name="auditlog")
    op.drop_table("auditlog")

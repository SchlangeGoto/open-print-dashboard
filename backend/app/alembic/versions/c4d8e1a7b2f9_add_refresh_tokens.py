"""Add refresh tokens

Revision ID: c4d8e1a7b2f9
Revises: e2b7c9f4a1d3
Create Date: 2026-11-08 22:30:00.000000

"""
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

revision = "c4d8e1a7b2f9"
down_revision = "e2b7c9f4a1d3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "refreshtoken",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "token_hash",
            sqlmodel.sql.sqltypes.AutoString(length=64),
            nullable=False,
        ),
        sa.Column("expires_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
        sa.Column("created_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True),
        sa.Column("revoked_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_refreshtoken_user_id"), "refreshtoken", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_refreshtoken_token_hash"),
        "refreshtoken",
        ["token_hash"],
        unique=True,
    )


def downgrade():
    op.drop_index(op.f("ix_refreshtoken_token_hash"), table_name="refreshtoken")
    op.drop_index(op.f("ix_refreshtoken_user_id"), table_name="refreshtoken")
    op.drop_table("refreshtoken")

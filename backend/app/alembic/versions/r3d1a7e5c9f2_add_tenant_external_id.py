"""add the tenant external id

Revision ID: r3d1a7e5c9f2
Revises: q2c9f1d6b8e4
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "r3d1a7e5c9f2"
down_revision: str | Sequence[str] | None = "q2c9f1d6b8e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tenant",
        sa.Column(
            "external_id",
            sqlmodel.sql.sqltypes.AutoString(length=100),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_tenant_external_id", "tenant", ["external_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_tenant_external_id", table_name="tenant")
    op.drop_column("tenant", "external_id")

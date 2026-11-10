"""add user.password_reset_jti

Revision ID: b7e1f5a9c4d6
Revises: a6d0e4f8b3c5

Password-reset links are burned after one use. The server stores the id of the
newest issued token so a leaked link cannot be reused and an old link cannot
reset a recreated account with the same email.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7e1f5a9c4d6"
down_revision: str | Sequence[str] | None = "a6d0e4f8b3c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("password_reset_jti", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user", "password_reset_jti")

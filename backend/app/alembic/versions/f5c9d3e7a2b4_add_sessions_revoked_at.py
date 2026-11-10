"""add user.sessions_revoked_at

Revision ID: f5c9d3e7a2b4
Revises: e4b8c2d6f1a3

Access tokens are stateless. This column records when all sessions were
revoked (password change or refresh-token reuse) so tokens issued earlier can
be rejected.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f5c9d3e7a2b4"
down_revision: str | Sequence[str] | None = "e4b8c2d6f1a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "sessions_revoked_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("user", "sessions_revoked_at")

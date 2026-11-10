"""retire the LAN printer mode

Revision ID: f4c1a8d2e6b7
Revises: d9e3a1c5b7f2

Local MQTT / LAN-only mode is retired: it requires the printer to run in
LAN-only mode, which disables the cloud features the product depends on.
Every printer now connects through Bambu Cloud.

The ``ip``, ``access_code`` and ``connection_mode`` columns are kept for one
release so an older app version can still start. This migration flips every
existing row to ``cloud`` and clears the obsolete credentials. A follow-up
migration will drop the columns.

Downgrade is intentionally lossy: the cleared credentials cannot be restored.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f4c1a8d2e6b7"
down_revision: str | Sequence[str] | None = "d9e3a1c5b7f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text("UPDATE printer SET connection_mode = 'cloud'")
    )
    op.execute(
        sa.text("UPDATE printer SET ip = NULL, access_code = NULL")
    )


def downgrade() -> None:
    # Lossy by design: the cleared LAN credentials cannot be restored.
    pass

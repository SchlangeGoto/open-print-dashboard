"""clear the retired nfc_uid values

Revision ID: d3a7c1e9f5b2
Revises: b8e2f4a6c1d3

The NFC/UID experiment is removed; barcodes and the AMS RFID (``tag_uid``) are
the supported identifiers. The column stays for one release, like the LAN
columns, and is cleared so no stale identifiers remain.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d3a7c1e9f5b2"
down_revision: str | Sequence[str] | None = "b8e2f4a6c1d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE spool SET nfc_uid = NULL"))


def downgrade() -> None:
    # The cleared values cannot be restored.
    pass

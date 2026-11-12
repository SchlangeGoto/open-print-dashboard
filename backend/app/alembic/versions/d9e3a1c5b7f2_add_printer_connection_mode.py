"""Add cloud/LAN connection mode to printers

Revision ID: d9e3a1c5b7f2
Revises: c4d8e1a7b2f9
Create Date: 2026-11-09 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "d9e3a1c5b7f2"
down_revision = "c4d8e1a7b2f9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "printer",
        sa.Column(
            "connection_mode",
            sa.String(length=20),
            nullable=False,
            server_default="cloud",
        ),
    )
    op.alter_column(
        "printer",
        "ip",
        existing_type=sa.String(length=100),
        nullable=True,
    )
    op.alter_column(
        "printer",
        "access_code",
        existing_type=sa.String(length=100),
        nullable=True,
    )

    # Every pre-existing printer was configured with a LAN address and access
    # code, so keep it on the local connection path.
    op.execute(
        "UPDATE printer SET connection_mode = 'lan' "
        "WHERE ip IS NOT NULL AND access_code IS NOT NULL"
    )
    op.alter_column("printer", "connection_mode", server_default=None)


def downgrade():
    # Rows added in cloud mode have no LAN credentials. Give them empty strings
    # before making the columns required again.
    op.execute("UPDATE printer SET ip = '' WHERE ip IS NULL")
    op.execute("UPDATE printer SET access_code = '' WHERE access_code IS NULL")
    op.alter_column(
        "printer",
        "ip",
        existing_type=sa.String(length=100),
        nullable=False,
    )
    op.alter_column(
        "printer",
        "access_code",
        existing_type=sa.String(length=100),
        nullable=False,
    )
    op.drop_column("printer", "connection_mode")

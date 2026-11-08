"""Add multi-printer configuration

Revision ID: f3a9c1d7b2e4
Revises: b1f7a2c9d4e5
Create Date: 2026-11-08 00:00:00.000000

"""
import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "f3a9c1d7b2e4"
down_revision = "b1f7a2c9d4e5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "printer",
        sa.Column(
            "name", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False
        ),
        sa.Column(
            "serial", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False
        ),
        sa.Column("ip", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column(
            "access_code",
            sqlmodel.sql.sqltypes.AutoString(length=100),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_printer_serial"), "printer", ["serial"], unique=True)

    # Preserve the single printer from the old key/value configuration.
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT key, value FROM appsetting "
            "WHERE key IN ('printer_ip', 'printer_serial', 'printer_access_code')"
        )
    ).all()
    values = {row[0]: row[1] for row in rows}
    serial = values.get("printer_serial")
    ip = values.get("printer_ip")
    access_code = values.get("printer_access_code")
    if serial and ip and access_code:
        now = datetime.now(UTC)
        bind.execute(
            sa.text(
                "INSERT INTO printer "
                "(id, name, serial, ip, access_code, created_at, updated_at) "
                "VALUES (:id, :name, :serial, :ip, :access_code, "
                ":created_at, :updated_at)"
            ),
            {
                "id": uuid.uuid4(),
                "name": serial,
                "serial": serial,
                "ip": ip,
                "access_code": access_code,
                "created_at": now,
                "updated_at": now,
            },
        )
        bind.execute(
            sa.text(
                "DELETE FROM appsetting "
                "WHERE key IN ('printer_ip', 'printer_serial', 'printer_access_code')"
            )
        )


def downgrade():
    op.drop_index(op.f("ix_printer_serial"), table_name="printer")
    op.drop_table("printer")

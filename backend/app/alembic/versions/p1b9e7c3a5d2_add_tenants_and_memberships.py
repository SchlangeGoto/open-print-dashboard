"""add tenants, memberships and tenant-scoped data

Revision ID: p1b9e7c3a5d2
Revises: o1f2a3b4c5d6

Every existing row is backfilled to a Default tenant with a fixed id, so
services that run before a request can resolve a tenant deterministically.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "p1b9e7c3a5d2"
down_revision: str | Sequence[str] | None = "o1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"

TABLES_WITH_TENANT = (
    "appsetting",
    "filament",
    "filamentbarcode",
    "printer",
    "printjob",
    "spool",
)


def upgrade() -> None:
    op.create_table(
        "tenant",
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column("slug", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True
        ),
        sa.Column(
            "updated_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenant_slug", "tenant", ["slug"], unique=True)

    op.create_table(
        "membership",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role", sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False
        ),
        sa.Column(
            "created_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id", "user_id", name="uq_membership_tenant_user"
        ),
    )
    op.create_index("ix_membership_tenant_id", "membership", ["tenant_id"])
    op.create_index("ix_membership_user_id", "membership", ["user_id"])

    op.create_table(
        "tenantinvite",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column(
            "email", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False
        ),
        sa.Column(
            "role", sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False
        ),
        sa.Column(
            "token_hash",
            sqlmodel.sql.sqltypes.AutoString(length=64),
            nullable=False,
        ),
        sa.Column("expires_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
        sa.Column("invited_by", sa.Uuid(), nullable=True),
        sa.Column("accepted_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True),
        sa.Column("revoked_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True),
        sa.Column(
            "created_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=True
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenantinvite_tenant_id", "tenantinvite", ["tenant_id"])
    op.create_index("ix_tenantinvite_email", "tenantinvite", ["email"])
    op.create_index(
        "ix_tenantinvite_token_hash", "tenantinvite", ["token_hash"], unique=True
    )
    op.create_index(
        "uq_tenant_invite_pending",
        "tenantinvite",
        ["tenant_id", "email"],
        unique=True,
        postgresql_where=sa.text(
            "accepted_at IS NULL AND revoked_at IS NULL"
        ),
    )

    op.execute(
        sa.text(
            "INSERT INTO tenant (id, name, slug, is_active, created_at, updated_at) "
            "VALUES (CAST(:id AS uuid), 'Default', 'default', true, now(), now())"
        ).bindparams(id=DEFAULT_TENANT_ID)
    )

    for table in TABLES_WITH_TENANT:
        op.add_column(table, sa.Column("tenant_id", sa.Uuid(), nullable=True))
        op.execute(
            sa.text(
                f"UPDATE {table} SET tenant_id = CAST(:tenant_id AS uuid)"
            ).bindparams(tenant_id=DEFAULT_TENANT_ID)
        )
        op.alter_column(table, "tenant_id", nullable=False)
        op.create_foreign_key(
            f"{table}_tenant_id_fkey",
            table,
            "tenant",
            ["tenant_id"],
            ["id"],
            ondelete="CASCADE",
        )
        # appsetting already leads its composite primary key with tenant_id.
        if table != "appsetting":
            op.create_index(f"ix_{table}_tenant_id", table, ["tenant_id"])

    # AppSetting moves from a global key PK to (tenant_id, key).
    op.drop_constraint("appsetting_pkey", "appsetting", type_="primary")
    op.create_primary_key(
        "appsetting_pkey", "appsetting", ["tenant_id", "key"]
    )

    # Printer serial is only unique within a tenant.
    op.drop_index("ix_printer_serial", table_name="printer")
    op.create_index(
        "uq_printer_tenant_serial",
        "printer",
        ["tenant_id", "serial"],
        unique=True,
    )

    # A packaging barcode is only unique within a tenant.
    op.drop_index("ix_filamentbarcode_code", table_name="filamentbarcode")
    op.create_index(
        "uq_filamentbarcode_tenant_code",
        "filamentbarcode",
        ["tenant_id", "code"],
        unique=True,
    )

    # RFID tags and client request ids are only unique within a tenant.
    op.drop_index("ix_spool_tag_uid", table_name="spool")
    op.drop_index("uq_spool_request_id", table_name="spool")
    op.create_index(
        "uq_spool_tenant_tag_uid",
        "spool",
        ["tenant_id", "tag_uid"],
        unique=True,
    )
    op.create_index(
        "uq_spool_tenant_request_id",
        "spool",
        ["tenant_id", "request_id"],
        unique=True,
    )
    op.create_index(
        "ix_spool_tenant_barcode", "spool", ["tenant_id", "barcode"]
    )

    # A cloud task id is only unique within a tenant.
    op.drop_constraint(
        "uq_printjob_device_task", "printjob", type_="unique"
    )
    op.create_unique_constraint(
        "uq_printjob_tenant_device_task",
        "printjob",
        ["tenant_id", "device_id", "bambu_task_id"],
    )

    # Existing accounts keep access. The oldest superuser becomes the Default
    # owner; everyone else keeps the write access they had as an operator.
    op.execute(
        sa.text(
            "INSERT INTO membership (id, tenant_id, user_id, role, created_at) "
            "SELECT gen_random_uuid(), CAST(:tenant_id AS uuid), u.id, "
            "CASE WHEN u.id = ("
            "  SELECT id FROM \"user\" WHERE is_superuser "
            "  ORDER BY created_at NULLS LAST, id LIMIT 1"
            ") THEN 'owner' ELSE 'operator' END, now() "
            "FROM \"user\" u"
        ).bindparams(tenant_id=DEFAULT_TENANT_ID)
    )
    op.create_index(
        "uq_membership_tenant_owner",
        "membership",
        ["tenant_id"],
        unique=True,
        postgresql_where=sa.text("role = 'owner'"),
    )


def downgrade() -> None:
    op.drop_index("uq_membership_tenant_owner", table_name="membership")
    op.drop_table("membership")
    op.drop_table("tenantinvite")

    op.drop_constraint(
        "uq_printjob_tenant_device_task", "printjob", type_="unique"
    )
    op.create_unique_constraint(
        "uq_printjob_device_task",
        "printjob",
        ["device_id", "bambu_task_id"],
    )

    op.drop_index("ix_spool_tenant_barcode", table_name="spool")
    op.drop_index("uq_spool_tenant_request_id", table_name="spool")
    op.drop_index("uq_spool_tenant_tag_uid", table_name="spool")
    op.create_index(
        "uq_spool_request_id", "spool", ["request_id"], unique=True
    )
    op.create_index(
        "ix_spool_tag_uid", "spool", ["tag_uid"], unique=True
    )

    op.drop_index(
        "uq_filamentbarcode_tenant_code", table_name="filamentbarcode"
    )
    op.create_index(
        "ix_filamentbarcode_code",
        "filamentbarcode",
        ["code"],
        unique=True,
    )

    op.drop_index("uq_printer_tenant_serial", table_name="printer")
    op.create_index("ix_printer_serial", "printer", ["serial"], unique=True)

    op.drop_constraint("appsetting_pkey", "appsetting", type_="primary")
    op.create_primary_key("appsetting_pkey", "appsetting", ["key"])

    for table in reversed(TABLES_WITH_TENANT):
        if table != "appsetting":
            op.drop_index(f"ix_{table}_tenant_id", table_name=table)
        op.drop_constraint(
            f"{table}_tenant_id_fkey", table, type_="foreignkey"
        )
        op.drop_column(table, "tenant_id")

    op.drop_index("ix_tenant_slug", table_name="tenant")
    op.drop_table("tenant")

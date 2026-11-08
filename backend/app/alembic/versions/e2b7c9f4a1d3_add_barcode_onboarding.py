"""Add barcode onboarding fields

Revision ID: e2b7c9f4a1d3
Revises: a7c4e2f9d1b6
Create Date: 2026-11-08 21:30:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = "e2b7c9f4a1d3"
down_revision = "a7c4e2f9d1b6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "filament",
        sa.Column("spool_weight_g", sa.Float(), nullable=False, server_default="1000"),
    )
    op.add_column("spool", sa.Column("tag_uid", sa.String(length=100), nullable=True))
    op.add_column("spool", sa.Column("barcode", sa.String(length=100), nullable=True))
    op.add_column("spool", sa.Column("source", sa.String(length=20), nullable=True))
    op.create_index(op.f("ix_spool_tag_uid"), "spool", ["tag_uid"], unique=False)
    op.create_index(op.f("ix_spool_barcode"), "spool", ["barcode"], unique=False)

    op.create_table(
        "filamentbarcode",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("filament_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["filament_id"], ["filament.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_filamentbarcode_code"), "filamentbarcode", ["code"], unique=True
    )
    op.create_index(
        op.f("ix_filamentbarcode_filament_id"),
        "filamentbarcode",
        ["filament_id"],
        unique=False,
    )


def downgrade():
    op.drop_index(op.f("ix_filamentbarcode_filament_id"), table_name="filamentbarcode")
    op.drop_index(op.f("ix_filamentbarcode_code"), table_name="filamentbarcode")
    op.drop_table("filamentbarcode")
    op.drop_index(op.f("ix_spool_barcode"), table_name="spool")
    op.drop_index(op.f("ix_spool_tag_uid"), table_name="spool")
    op.drop_column("spool", "source")
    op.drop_column("spool", "barcode")
    op.drop_column("spool", "tag_uid")
    op.drop_column("filament", "spool_weight_g")

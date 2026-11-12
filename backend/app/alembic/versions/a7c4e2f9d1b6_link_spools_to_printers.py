"""Link spools to printers

Revision ID: a7c4e2f9d1b6
Revises: f3a9c1d7b2e4
Create Date: 2026-11-08 00:30:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = "a7c4e2f9d1b6"
down_revision = "f3a9c1d7b2e4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("spool", sa.Column("printer_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_spool_printer_id"), "spool", ["printer_id"], unique=False)
    op.create_foreign_key(
        "spool_printer_id_fkey",
        "spool",
        "printer",
        ["printer_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # The old single active spool belongs to the first configured printer.
    bind = op.get_bind()
    first_printer = bind.execute(
        sa.text("SELECT id FROM printer ORDER BY created_at NULLS LAST LIMIT 1")
    ).first()
    if first_printer:
        bind.execute(
            sa.text("UPDATE spool SET printer_id = :printer_id WHERE active = true"),
            {"printer_id": first_printer[0]},
        )


def downgrade():
    op.drop_constraint("spool_printer_id_fkey", "spool", type_="foreignkey")
    op.drop_index(op.f("ix_spool_printer_id"), table_name="spool")
    op.drop_column("spool", "printer_id")

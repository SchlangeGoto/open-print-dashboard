"""add printjob filament usage table

Revision ID: n3b8d6f2a4c9
Revises: m2a7c5e9f1b3

Normalise per-filament usage so stats can aggregate with SQL instead of
parsing every job's JSON.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "n3b8d6f2a4c9"
down_revision: str | Sequence[str] | None = "m2a7c5e9f1b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "printjob_filament_usage",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("print_job_id", sa.Uuid(), nullable=False),
        sa.Column("filament_id", sa.Uuid(), nullable=True),
        sa.Column("weight_g", sa.Float(), nullable=False),
        sa.Column("cost", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(
            ["print_job_id"], ["printjob.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["filament_id"], ["filament.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "print_job_id",
            "filament_id",
            name="uq_printjob_filament_usage",
        ),
    )
    op.create_index(
        op.f("ix_printjob_filament_usage_print_job_id"),
        "printjob_filament_usage",
        ["print_job_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_printjob_filament_usage_filament_id"),
        "printjob_filament_usage",
        ["filament_id"],
        unique=False,
    )

    op.execute(
        """
        INSERT INTO printjob_filament_usage
            (id, print_job_id, filament_id, weight_g, cost)
        SELECT gen_random_uuid(), p.id, (kv.key)::uuid,
               COALESCE((kv.value->>'weight')::float, 0),
               (kv.value->>'cost')::float
        FROM printjob p, jsonb_each(p.filament_usage::jsonb) kv
        WHERE p.filament_usage IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO printjob_filament_usage
            (id, print_job_id, filament_id, weight_g, cost)
        SELECT gen_random_uuid(), p.id, p.filament_id,
               COALESCE(p.weight, 0), p.estimated_cost
        FROM printjob p
        WHERE p.filament_usage IS NULL AND p.filament_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_printjob_filament_usage_filament_id"),
        table_name="printjob_filament_usage",
    )
    op.drop_index(
        op.f("ix_printjob_filament_usage_print_job_id"),
        table_name="printjob_filament_usage",
    )
    op.drop_table("printjob_filament_usage")

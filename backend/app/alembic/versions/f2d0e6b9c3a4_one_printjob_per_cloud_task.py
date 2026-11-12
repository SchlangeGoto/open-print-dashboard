"""one printjob per cloud task

Revision ID: f2d0e6b9c3a4
Revises: e1c9d4a7b2f5

A cloud task may produce overlapping FINISH/init handlers. Without a unique
key both can insert a row and deduct filament twice. Backfill the deduction
marker for finished history, drop duplicate rows, then enforce the key.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f2d0e6b9c3a4"
down_revision: str | Sequence[str] | None = "e1c9d4a7b2f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Jobs finished before the column existed must not be deducted again if a
    # finish event is ever replayed.
    op.execute(
        """
        UPDATE printjob
        SET filament_deducted_at = COALESCE(finished_at, created_at)
        WHERE finished_at IS NOT NULL
          AND filament_deducted_at IS NULL
        """
    )

    # Keep the most complete row: deducted first, then finished, then oldest.
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY device_id, bambu_task_id
                       ORDER BY (filament_deducted_at IS NOT NULL) DESC,
                                (finished_at IS NOT NULL) DESC,
                                created_at ASC,
                                id ASC
                   ) AS rn
            FROM printjob
            WHERE bambu_task_id IS NOT NULL
              AND device_id IS NOT NULL
        )
        DELETE FROM printjob p
        USING ranked r
        WHERE p.id = r.id AND r.rn > 1
        """
    )

    op.create_unique_constraint(
        "uq_printjob_device_task",
        "printjob",
        ["device_id", "bambu_task_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_printjob_device_task", "printjob", type_="unique"
    )

"""add printjob filament usage table

Revision ID: n3b8d6f2a4c9
Revises: m2a7c5e9f1b3

Normalise per-filament usage so stats can aggregate with SQL instead of
parsing every job's JSON.
"""

import json
import uuid as uuid_module
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "n3b8d6f2a4c9"
down_revision: str | Sequence[str] | None = "m2a7c5e9f1b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _as_float(value: object, default: float | None = None) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _backfill_usage() -> None:
    """Copy JSON and legacy usage into the child table.

    Production data may contain invalid JSON, non-object payloads, non-UUID
    keys, non-numeric values, or keys for filaments that were deleted (the
    ``filament_usage`` JSON has no foreign key). None of those may abort the
    upgrade, so every row is validated individually and bad entries are
    skipped.
    """
    bind = op.get_bind()
    known = {
        uuid_module.UUID(str(row[0]))
        for row in bind.execute(sa.text("SELECT id FROM filament")).all()
    }
    insert = sa.text(
        "INSERT INTO printjob_filament_usage "
        "(id, print_job_id, filament_id, weight_g, cost) "
        "VALUES (:id, :print_job_id, :filament_id, :weight_g, :cost)"
    )
    # Stream the history in pages so a large printjob table cannot blow up
    # the migration's memory at container start.
    page_size = 1000
    last_id = None
    while True:
        statement = (
            "SELECT id, filament_id, weight, estimated_cost, filament_usage "
            "FROM printjob ORDER BY id LIMIT :limit"
            if last_id is None
            else (
                "SELECT id, filament_id, weight, estimated_cost, filament_usage "
                "FROM printjob WHERE id > :last_id ORDER BY id LIMIT :limit"
            )
        )
        params: dict[str, Any] = {"limit": page_size}
        if last_id is not None:
            params["last_id"] = last_id
        rows = bind.execute(sa.text(statement), params).all()
        if not rows:
            break

        payload: list[dict[str, Any]] = []
        for job_id, legacy_id, weight, cost, raw in rows:
            parsed: dict[str, Any] | None = None
            if raw:
                try:
                    candidate = json.loads(raw)
                except (TypeError, ValueError):
                    candidate = None
                if isinstance(candidate, dict):
                    parsed = candidate

            if parsed:
                # The JSON is authoritative for multi-material jobs. Deleted
                # filaments are skipped instead of falling back to the primary
                # row, which would credit the whole job to one filament.
                seen: set[uuid_module.UUID] = set()
                for raw_key, item in parsed.items():
                    try:
                        filament_id = uuid_module.UUID(str(raw_key))
                    except (TypeError, ValueError, AttributeError):
                        continue
                    if filament_id not in known or filament_id in seen:
                        continue
                    seen.add(filament_id)
                    values = item if isinstance(item, dict) else {}
                    payload.append(
                        {
                            "id": uuid_module.uuid4(),
                            "print_job_id": job_id,
                            "filament_id": filament_id,
                            "weight_g": _as_float(values.get("weight"), 0.0),
                            "cost": _as_float(values.get("cost")),
                        }
                    )
            else:
                try:
                    legacy_uuid = (
                        uuid_module.UUID(str(legacy_id))
                        if legacy_id is not None
                        else None
                    )
                except (TypeError, ValueError, AttributeError):
                    legacy_uuid = None
                if legacy_uuid is not None and legacy_uuid in known:
                    payload.append(
                        {
                            "id": uuid_module.uuid4(),
                            "print_job_id": job_id,
                            "filament_id": legacy_uuid,
                            "weight_g": _as_float(weight, 0.0),
                            "cost": _as_float(cost),
                        }
                    )

        if payload:
            bind.execute(insert, payload)
        last_id = rows[-1][0]


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

    _backfill_usage()


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

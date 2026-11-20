import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app import crud
from app.api.deps import TenantContextDep, require_permission
from app.models import (
    Filament,
    FilamentCreate,
    FilamentPublic,
    FilamentPublicWithStats,
    FilamentsPublic,
    FilamentStats,
    FilamentUpdate,
    Message,
    Spool,
    SpoolPublic,
    SpoolsPublic,
)

router = APIRouter(
    prefix="/filaments",
    tags=["filaments"],
    dependencies=[Depends(require_permission("filaments.read"))],
)


def _get_filament(context: TenantContextDep, filament_id: uuid.UUID) -> Filament:
    filament = context.session.exec(
        select(Filament).where(
            Filament.id == filament_id,
            Filament.tenant_id == context.tenant.id,
        )
    ).first()
    if not filament:
        raise HTTPException(status_code=404, detail="Filament not found")
    return filament


@router.get("/", response_model=FilamentsPublic)
def read_filaments(context: TenantContextDep) -> Any:
    """Retrieve all filaments, including remaining stock and average price."""
    session = context.session
    tenant_id = context.tenant.id
    filaments = session.exec(
        select(Filament).where(Filament.tenant_id == tenant_id)
    ).all()

    remaining_rows = session.exec(
        select(Spool.filament_id, func.sum(Spool.remaining_g))
        .where(Spool.tenant_id == tenant_id)
        .where(col(Spool.remaining_unknown).is_(False))
        .group_by(col(Spool.filament_id))
    ).all()
    remaining = {filament_id: total or 0.0 for filament_id, total in remaining_rows}

    # One window query keeps the five most recent prices per filament instead
    # of issuing two queries for every row.
    ranked_prices = (
        select(
            Spool.filament_id,
            Spool.price_per_kg,
            func.row_number()
            .over(
                partition_by=col(Spool.filament_id),
                order_by=col(Spool.created_at).desc(),
            )
            .label("rn"),
        )
        .where(Spool.tenant_id == tenant_id)
        .where(col(Spool.price_per_kg) > 0)
        .subquery()
    )
    price_rows = session.exec(
        select(ranked_prices.c.filament_id, ranked_prices.c.price_per_kg).where(
            ranked_prices.c.rn <= 5
        )
    ).all()
    prices_by_filament: dict[uuid.UUID, list[float]] = {}
    for filament_id, price in price_rows:
        if price and price > 0:
            prices_by_filament.setdefault(filament_id, []).append(price)

    data: list[FilamentPublicWithStats] = []
    for filament in filaments:
        prices = prices_by_filament.get(filament.id, [])
        avg_price = sum(prices) / len(prices) if prices else None
        data.append(
            FilamentPublicWithStats.model_validate(
                filament,
                update={
                    "total_remaining_g": remaining.get(filament.id, 0.0),
                    "avg_price_per_kg": round(avg_price, 2) if avg_price else None,
                },
            )
        )
    return FilamentsPublic(data=data, count=len(data))


@router.get("/stats/{filament_id}", response_model=FilamentStats)
def read_filament_stats(filament_id: uuid.UUID, context: TenantContextDep) -> Any:
    _get_filament(context, filament_id)
    return crud.get_filament_stats(session=context.session, filament_id=filament_id)


@router.get("/{filament_id}/spools", response_model=SpoolsPublic)
def read_filament_spools(filament_id: uuid.UUID, context: TenantContextDep) -> Any:
    _get_filament(context, filament_id)
    spools = context.session.exec(
        select(Spool).where(
            Spool.filament_id == filament_id,
            Spool.tenant_id == context.tenant.id,
        )
    ).all()
    return SpoolsPublic(
        data=[SpoolPublic.model_validate(s) for s in spools], count=len(spools)
    )


@router.get("/{filament_id}", response_model=FilamentPublic)
def read_filament(filament_id: uuid.UUID, context: TenantContextDep) -> Any:
    return _get_filament(context, filament_id)


@router.post(
    "/",
    response_model=FilamentPublic,
    dependencies=[Depends(require_permission("filaments.write"))],
)
def create_filament(*, context: TenantContextDep, filament_in: FilamentCreate) -> Any:
    filament = Filament.model_validate(
        filament_in, update={"tenant_id": context.tenant.id}
    )
    context.session.add(filament)
    context.session.commit()
    context.session.refresh(filament)
    crud.record_audit(
        session=context.session,
        tenant_id=context.tenant.id,
        user_id=context.user.id,
        action="filament.create",
        target=str(filament.id),
    )
    return filament


@router.put(
    "/{filament_id}",
    response_model=FilamentPublic,
    dependencies=[Depends(require_permission("filaments.write"))],
)
def update_filament(
    *,
    context: TenantContextDep,
    filament_id: uuid.UUID,
    filament_in: FilamentUpdate,
) -> Any:
    filament = _get_filament(context, filament_id)
    filament.sqlmodel_update(filament_in.model_dump(exclude_unset=True))
    context.session.add(filament)
    context.session.commit()
    context.session.refresh(filament)
    return filament


@router.delete(
    "/{filament_id}",
    response_model=Message,
    dependencies=[Depends(require_permission("filaments.write"))],
)
def delete_filament(filament_id: uuid.UUID, context: TenantContextDep) -> Any:
    filament = _get_filament(context, filament_id)
    context.session.delete(filament)
    context.session.commit()
    crud.record_audit(
        session=context.session,
        tenant_id=context.tenant.id,
        user_id=context.user.id,
        action="filament.delete",
        target=str(filament_id),
    )
    return Message(message="Filament deleted")

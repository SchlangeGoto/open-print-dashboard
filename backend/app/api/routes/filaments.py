import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app import crud
from app.api.deps import SessionDep, get_current_user
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
    dependencies=[Depends(get_current_user)],
)


@router.get("/", response_model=FilamentsPublic)
def read_filaments(session: SessionDep) -> Any:
    """Retrieve all filaments, including remaining stock and average price."""
    filaments = session.exec(select(Filament)).all()
    data: list[FilamentPublicWithStats] = []
    for filament in filaments:
        total_remaining = (
            session.exec(
                select(func.sum(Spool.remaining_g)).where(
                    Spool.filament_id == filament.id
                )
            ).first()
            or 0.0
        )
        recent_prices = session.exec(
            select(Spool.price_per_kg)
            .where(Spool.filament_id == filament.id)
            .where(col(Spool.price_per_kg).is_not(None))
            .order_by(col(Spool.created_at).desc())
            .limit(5)
        ).all()
        prices = [price for price in recent_prices if price is not None]
        avg_price = sum(prices) / len(prices) if prices else None
        data.append(
            FilamentPublicWithStats.model_validate(
                filament,
                update={
                    "total_remaining_g": total_remaining,
                    "avg_price_per_kg": round(avg_price, 2) if avg_price else None,
                },
            )
        )
    return FilamentsPublic(data=data, count=len(data))


@router.get("/stats/{filament_id}", response_model=FilamentStats)
def read_filament_stats(filament_id: uuid.UUID, session: SessionDep) -> Any:
    return crud.get_filament_stats(session=session, filament_id=filament_id)


@router.get("/{filament_id}/spools", response_model=SpoolsPublic)
def read_filament_spools(filament_id: uuid.UUID, session: SessionDep) -> Any:
    spools = session.exec(select(Spool).where(Spool.filament_id == filament_id)).all()
    return SpoolsPublic(
        data=[SpoolPublic.model_validate(s) for s in spools], count=len(spools)
    )


@router.get("/{filament_id}", response_model=FilamentPublic)
def read_filament(filament_id: uuid.UUID, session: SessionDep) -> Any:
    filament = session.get(Filament, filament_id)
    if not filament:
        raise HTTPException(status_code=404, detail="Filament not found")
    return filament


@router.post("/", response_model=FilamentPublic)
def create_filament(*, session: SessionDep, filament_in: FilamentCreate) -> Any:
    filament = Filament.model_validate(filament_in)
    session.add(filament)
    session.commit()
    session.refresh(filament)
    return filament


@router.put("/{filament_id}", response_model=FilamentPublic)
def update_filament(
    *,
    session: SessionDep,
    filament_id: uuid.UUID,
    filament_in: FilamentUpdate,
) -> Any:
    filament = session.get(Filament, filament_id)
    if not filament:
        raise HTTPException(status_code=404, detail="Filament not found")
    update_dict = filament_in.model_dump(exclude_unset=True)
    filament.sqlmodel_update(update_dict)
    session.add(filament)
    session.commit()
    session.refresh(filament)
    return filament


@router.delete("/{filament_id}", response_model=Message)
def delete_filament(filament_id: uuid.UUID, session: SessionDep) -> Any:
    filament = session.get(Filament, filament_id)
    if not filament:
        raise HTTPException(status_code=404, detail="Filament not found")
    session.delete(filament)
    session.commit()
    return Message(message="Filament deleted")

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, func
from app.db.database import get_session
from app.db.models import Filament, Spool

router = APIRouter()

@router.get("/")
def get_filaments(session: Session = Depends(get_session)):
    filaments = session.exec(select(Filament)).all()
    result = []
    for f in filaments:
        total_remaining = session.exec(
            select(func.sum(Spool.remaining_g)).where(Spool.filament_id == f.id)
        ).first() or 0.0

        recent_prices = session.exec(
            select(Spool.price_per_kg)
            .where(Spool.filament_id == f.id)
            .where(Spool.price_per_kg is not None)
            .order_by(Spool.created_at.desc())
            .limit(5)
        ).all()

        avg_price = sum(recent_prices) / len(recent_prices) if recent_prices else None

        result.append({
            **f.model_dump(),
            "total_remaining_g": total_remaining,
            "avg_price_per_kg": round(avg_price, 2) if avg_price else None,
        })
    return result

@router.get("/{filament_id}")
def get_filament(filament_id: int, session: Session = Depends(get_session)):
    return session.exec(select(Filament).where(Filament.id == filament_id)).first()

@router.put("/{filament_id}")
def update_filament(filament_id: int ,filament: Filament, session: Session = Depends(get_session)):
    existing = session.get(Filament, filament_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Filament not found")
    existing.brand = filament.brand
    existing.material = filament.material
    existing.color_name = filament.color_name
    existing.color_hex = filament.color_hex
    existing.nozzle_temp_min = filament.nozzle_temp_min
    existing.nozzle_temp_max = filament.nozzle_temp_max
    existing.bed_temp = filament.bed_temp
    existing.bambu_info_idx = filament.bambu_info_idx
    existing.notes = filament.notes
    session.commit()
    session.refresh(existing)
    return existing

@router.post("/")
def create_filament(filament: Filament, session: Session = Depends(get_session)):
    session.add(filament)
    session.commit()
    session.refresh(filament)
    return filament

@router.delete("/{filament_id}")
def delete_filament(filament_id: int, session: Session = Depends(get_session)):
    existing = session.get(Filament, filament_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Filament not found")
    session.delete(existing)
    session.commit()
    return {"ok": True}
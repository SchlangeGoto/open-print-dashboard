from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db.database import get_session
from app.db.models import Spool, Filament

router = APIRouter()


@router.get("/")
def get_spools(filament_id: int | None = None, session: Session = Depends(get_session)):
    query = select(Spool)
    if filament_id:
        query = query.where(Spool.filament_id == filament_id)
    return session.exec(query).all()


@router.get("/active")
def get_active_spool(session: Session = Depends(get_session)):
    spool = session.exec(select(Spool).where(Spool.active == True)).first()
    if not spool:
        raise HTTPException(status_code=404, detail="No active spool")
    return spool


@router.get("/{spool_id}")
def get_spool(spool_id: int, session: Session = Depends(get_session)):
    spool = session.get(Spool, spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")
    return spool


@router.post("/")
def create_spool(spool: Spool, session: Session = Depends(get_session)):
    if spool.filament_id:
        filament = session.get(Filament, spool.filament_id)
        if not filament:
            raise HTTPException(status_code=404, detail="Filament not found")
    session.add(spool)
    session.commit()
    session.refresh(spool)
    return spool


@router.put("/{spool_id}")
def update_spool(spool_id: int, spool: Spool, session: Session = Depends(get_session)):
    existing = session.get(Spool, spool_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Spool not found")
    existing.filament_id = spool.filament_id
    existing.total_weight_g = spool.total_weight_g
    existing.remaining_g = spool.remaining_g
    existing.nfc_uid = spool.nfc_uid
    existing.active = spool.active
    existing.purchased_at = spool.purchased_at
    existing.last_used_at = spool.last_used_at
    existing.price_per_kg = spool.price_per_kg
    existing.notes = spool.notes
    session.commit()
    session.refresh(existing)
    return existing


@router.delete("/{spool_id}")
def delete_spool(spool_id: int, session: Session = Depends(get_session)):
    spool = session.get(Spool, spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")
    session.delete(spool)
    session.commit()
    return {"ok": True}


@router.put("/{spool_id}/activate")
def activate_spool(spool_id: int, session: Session = Depends(get_session)):
    spool = session.get(Spool, spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")

    active_spools = session.exec(select(Spool).where(Spool.active == True)).all()
    for s in active_spools:
        s.active = False

    spool.active = True
    session.commit()
    session.refresh(spool)
    return spool


@router.post("/scan")
def scan_nfc(payload: dict, session: Session = Depends(get_session)):
    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=400, detail="uid is required")

    spool = session.exec(select(Spool).where(Spool.nfc_uid == uid)).first()

    if spool:
        active_spools = session.exec(select(Spool).where(Spool.active == True)).all()
        for s in active_spools:
            s.active = False
        spool.active = True
        session.commit()
        session.refresh(spool)
        return {"found": True, "spool": spool}

    unassigned = session.exec(
        select(Spool).where(Spool.nfc_uid == None)
    ).all()
    return {"found": False, "uid": uid, "unassigned_spools": unassigned}


@router.post("/scan/assign")
def assign_nfc(payload: dict, session: Session = Depends(get_session)):
    """Assign a scanned NFC uid to an existing spool."""
    uid = payload.get("uid")
    spool_id = payload.get("spool_id")
    if not uid or not spool_id:
        raise HTTPException(status_code=400, detail="uid and spool_id are required")

    spool = session.get(Spool, spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")

    existing = session.exec(select(Spool).where(Spool.nfc_uid == uid)).first()
    if existing and existing.id != spool_id:
        raise HTTPException(status_code=400, detail="This NFC tag is already assigned to another spool")

    spool.nfc_uid = uid

    active_spools = session.exec(select(Spool).where(Spool.active == True)).all()
    for s in active_spools:
        s.active = False
    spool.active = True
    spool.last_used_at = datetime.now(timezone.utc)

    session.commit()
    session.refresh(spool)
    return {"ok": True, "spool": spool}
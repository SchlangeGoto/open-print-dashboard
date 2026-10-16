import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, select

from app.api.deps import SessionDep, get_current_user
from app.models import (
    Filament,
    Message,
    Spool,
    SpoolAssignRequest,
    SpoolCreate,
    SpoolPublic,
    SpoolScanRequest,
    SpoolScanResult,
    SpoolsPublic,
    SpoolUpdate,
)

router = APIRouter(
    prefix="/spools",
    tags=["spools"],
    dependencies=[Depends(get_current_user)],
)


def _deactivate_other_spools(*, session: SessionDep, keep_id: uuid.UUID | None) -> None:
    active_spools = session.exec(select(Spool).where(col(Spool.active).is_(True))).all()
    for spool in active_spools:
        if spool.id != keep_id:
            spool.active = False


@router.get("/", response_model=SpoolsPublic)
def read_spools(session: SessionDep, filament_id: uuid.UUID | None = None) -> Any:
    """Retrieve spools, optionally filtered by filament."""
    query = select(Spool)
    if filament_id:
        query = query.where(Spool.filament_id == filament_id)
    spools = session.exec(query.order_by(col(Spool.created_at).desc())).all()
    return SpoolsPublic(
        data=[SpoolPublic.model_validate(s) for s in spools], count=len(spools)
    )


@router.get("/active", response_model=SpoolPublic)
def read_active_spool(session: SessionDep) -> Any:
    """Return the spool that is currently loaded in the printer."""
    spool = session.exec(select(Spool).where(col(Spool.active).is_(True))).first()
    if not spool:
        raise HTTPException(status_code=404, detail="No active spool")
    return spool


@router.post("/scan", response_model=SpoolScanResult)
def scan_nfc(payload: SpoolScanRequest, session: SessionDep) -> Any:
    """Look up a spool by its NFC UID, activating it when found."""
    spool = session.exec(select(Spool).where(Spool.nfc_uid == payload.uid)).first()

    if spool:
        _deactivate_other_spools(session=session, keep_id=spool.id)
        spool.active = True
        session.add(spool)
        session.commit()
        session.refresh(spool)
        return SpoolScanResult(
            found=True, uid=payload.uid, spool=SpoolPublic.model_validate(spool)
        )

    unassigned = session.exec(select(Spool).where(col(Spool.nfc_uid).is_(None))).all()
    return SpoolScanResult(
        found=False,
        uid=payload.uid,
        unassigned_spools=[SpoolPublic.model_validate(s) for s in unassigned],
    )


@router.post("/scan/assign", response_model=SpoolScanResult)
def assign_nfc(payload: SpoolAssignRequest, session: SessionDep) -> Any:
    """Assign a scanned NFC UID to an existing spool and activate it."""
    spool = session.get(Spool, payload.spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")

    existing = session.exec(select(Spool).where(Spool.nfc_uid == payload.uid)).first()
    if existing and existing.id != payload.spool_id:
        raise HTTPException(
            status_code=400,
            detail="This NFC tag is already assigned to another spool",
        )

    spool.nfc_uid = payload.uid
    spool.last_used_at = datetime.now(UTC)
    _deactivate_other_spools(session=session, keep_id=spool.id)
    spool.active = True
    session.add(spool)
    session.commit()
    session.refresh(spool)
    return SpoolScanResult(
        found=True, uid=payload.uid, spool=SpoolPublic.model_validate(spool)
    )


@router.get("/{spool_id}", response_model=SpoolPublic)
def read_spool(spool_id: uuid.UUID, session: SessionDep) -> Any:
    spool = session.get(Spool, spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")
    return spool


@router.post("/", response_model=SpoolPublic)
def create_spool(*, session: SessionDep, spool_in: SpoolCreate) -> Any:
    if spool_in.filament_id:
        filament = session.get(Filament, spool_in.filament_id)
        if not filament:
            raise HTTPException(status_code=404, detail="Filament not found")
    spool = Spool.model_validate(spool_in)
    session.add(spool)
    session.flush()
    if spool.active:
        _deactivate_other_spools(session=session, keep_id=spool.id)
    session.commit()
    session.refresh(spool)
    return spool


@router.put("/{spool_id}", response_model=SpoolPublic)
def update_spool(
    *,
    session: SessionDep,
    spool_id: uuid.UUID,
    spool_in: SpoolUpdate,
) -> Any:
    spool = session.get(Spool, spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")
    update_dict = spool_in.model_dump(exclude_unset=True)
    spool.sqlmodel_update(update_dict)
    session.add(spool)
    session.flush()
    if spool.active:
        _deactivate_other_spools(session=session, keep_id=spool.id)
    session.commit()
    session.refresh(spool)
    return spool


@router.delete("/{spool_id}", response_model=Message)
def delete_spool(spool_id: uuid.UUID, session: SessionDep) -> Any:
    spool = session.get(Spool, spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")
    session.delete(spool)
    session.commit()
    return Message(message="Spool deleted")


@router.put("/{spool_id}/activate", response_model=SpoolPublic)
def activate_spool(spool_id: uuid.UUID, session: SessionDep) -> Any:
    spool = session.get(Spool, spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")
    _deactivate_other_spools(session=session, keep_id=spool.id)
    spool.active = True
    session.add(spool)
    session.commit()
    session.refresh(spool)
    return spool

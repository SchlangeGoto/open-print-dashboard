import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select

from app.api.deps import SessionDep, get_current_user
from app.models import (
    BarcodeConfirmRequest,
    BarcodeScanRequest,
    BarcodeScanResult,
    Filament,
    FilamentBarcode,
    FilamentPublic,
    Message,
    Printer,
    Spool,
    SpoolActivateRequest,
    SpoolCreate,
    SpoolPublic,
    SpoolsPublic,
    SpoolUpdate,
)
from app.services.bambu_catalog import lookup_barcode, parse_bambu_sku

router = APIRouter(
    prefix="/spools",
    tags=["spools"],
    dependencies=[Depends(get_current_user)],
)


def _unload_other_spools(
    *, session: SessionDep, printer_id: uuid.UUID, keep_id: uuid.UUID
) -> None:
    others = session.exec(
        select(Spool).where(Spool.printer_id == printer_id, col(Spool.id) != keep_id)
    ).all()
    for spool in others:
        spool.active = False
        spool.printer_id = None
    # Flush the unload before the caller activates the new spool; the partial
    # unique index checks each row as it is written.
    session.flush()


def _find_or_create_catalog_filament(
    *, session: SessionDep, data: dict[str, Any]
) -> Filament:
    info_idx = data.get("bambu_info_idx")
    filament = None
    if info_idx:
        # ``bambu_info_idx`` is nullable; ``== None`` would compile to IS NULL
        # and collapse unrelated products that share a colour.
        filament = session.exec(
            select(Filament)
            .where(
                Filament.bambu_info_idx == info_idx,
                func.lower(Filament.color_hex) == data["color_hex"].lower(),
            )
            .order_by(col(Filament.created_at).asc())
        ).first()
    if not filament:
        # Match an AMS-created filament whose preset id differs from the box
        # catalog. Brand, material, colour and series identify a product;
        # Support W/G/ABS all share brand/material/colour, so series is what
        # keeps them apart.
        series = (data.get("series") or "").strip()
        query = select(Filament).where(
            func.lower(Filament.color_hex) == data["color_hex"].lower(),
            func.lower(Filament.material) == data["material"].lower(),
            func.lower(Filament.brand) == data["brand"].lower(),
        )
        if series:
            query = query.where(func.lower(Filament.series) == series.lower())
        else:
            query = query.where(col(Filament.series).is_(None))
        filament = session.exec(query.order_by(col(Filament.created_at).asc())).first()
    if filament:
        return filament

    filament = Filament(
        brand=data["brand"],
        material=data["material"],
        series=data.get("series") or None,
        color_name=data["color_name"],
        color_hex=data["color_hex"],
        nozzle_temp_min=data.get("nozzle_temp_min"),
        nozzle_temp_max=data.get("nozzle_temp_max"),
        bed_temp=data.get("bed_temp"),
        bambu_info_idx=data.get("bambu_info_idx"),
        spool_weight_g=data.get("spool_weight_g", 1000),
        notes=data.get("notes"),
    )
    session.add(filament)
    session.flush()
    return filament


def _existing_barcode_spools(*, session: SessionDep, code: str) -> list[Spool]:
    return list(
        session.exec(
            select(Spool)
            .where(Spool.barcode == code)
            .order_by(col(Spool.created_at).desc())
        ).all()
    )


def _link_barcode(*, session: SessionDep, code: str, filament: Filament) -> Filament:
    """Persist a barcode→filament mapping, tolerating a concurrent insert.

    Two requests can both miss the mapping and each create a filament. The
    unique index on FilamentBarcode.code decides the winner; the loser rolls
    back its own filament and continues with the committed one instead of
    returning a 500.
    """
    session.add(FilamentBarcode(code=code, filament_id=filament.id))
    try:
        session.flush()
        return filament
    except IntegrityError:
        session.rollback()
        mapping = session.exec(
            select(FilamentBarcode).where(FilamentBarcode.code == code)
        ).first()
        existing = session.get(Filament, mapping.filament_id) if mapping else None
        if not existing:
            raise
        return existing


def _create_barcode_spool(
    *,
    session: SessionDep,
    filament: Filament,
    code: str,
    total_weight_g: float | None = None,
    price_per_kg: float | None = None,
    request_id: str | None = None,
) -> Spool:
    weight = total_weight_g or filament.spool_weight_g or 1000
    spool = Spool(
        filament_id=filament.id,
        total_weight_g=weight,
        remaining_g=weight,
        barcode=code,
        source="barcode",
        price_per_kg=price_per_kg,
        request_id=request_id,
    )
    session.add(spool)
    session.commit()
    session.refresh(spool)
    return spool


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
def read_active_spool(session: SessionDep, printer_id: uuid.UUID | None = None) -> Any:
    """Return a loaded spool, optionally scoped to one printer."""
    query = (
        select(Spool)
        .where(col(Spool.active).is_(True))
        .where(col(Spool.printer_id).is_not(None))
        .order_by(col(Spool.created_at).desc(), col(Spool.id).desc())
    )
    if printer_id:
        query = query.where(Spool.printer_id == printer_id)
    spool = session.exec(query).first()
    if not spool:
        raise HTTPException(status_code=404, detail="No active spool")
    return spool


@router.post("/scan/barcode", response_model=BarcodeScanResult)
def scan_barcode(payload: BarcodeScanRequest, session: SessionDep) -> Any:
    """Look up a packaging barcode and create a spool when it is known."""
    code = payload.code.strip()
    if payload.request_id:
        replay = session.exec(
            select(Spool).where(Spool.request_id == payload.request_id)
        ).first()
        if replay:
            filament = session.get(Filament, replay.filament_id)
            return BarcodeScanResult(
                found=filament is not None,
                code=replay.barcode or code,
                filament=(
                    FilamentPublic.model_validate(filament) if filament else None
                ),
                spool=SpoolPublic.model_validate(replay),
                created=False,
                existing_spools=[SpoolPublic.model_validate(replay)],
            )
    mapping = session.exec(
        select(FilamentBarcode).where(FilamentBarcode.code == code)
    ).first()
    filament = session.get(Filament, mapping.filament_id) if mapping else None

    if not filament:
        catalog = lookup_barcode(code)
        if catalog:
            candidate = _find_or_create_catalog_filament(session=session, data=catalog)
            filament = _link_barcode(session=session, code=code, filament=candidate)

    if not filament:
        return BarcodeScanResult(
            found=False,
            code=code,
            suggested_filament=parse_bambu_sku(payload.sku),
        )

    existing = _existing_barcode_spools(session=session, code=code)
    if not payload.create:
        return BarcodeScanResult(
            found=True,
            code=code,
            filament=FilamentPublic.model_validate(filament),
            spool=SpoolPublic.model_validate(existing[0]) if existing else None,
            created=False,
            existing_spools=[SpoolPublic.model_validate(s) for s in existing],
        )

    try:
        spool = _create_barcode_spool(
            session=session,
            filament=filament,
            code=code,
            request_id=payload.request_id,
        )
    except IntegrityError:
        # Two retries raced; the unique request_id decides. Return the winner.
        session.rollback()
        if not payload.request_id:
            raise
        spool = session.exec(
            select(Spool).where(Spool.request_id == payload.request_id)
        ).one()
        filament = session.get(Filament, spool.filament_id)
        return BarcodeScanResult(
            found=True,
            code=spool.barcode or code,
            filament=(FilamentPublic.model_validate(filament) if filament else None),
            spool=SpoolPublic.model_validate(spool),
            created=False,
            existing_spools=[SpoolPublic.model_validate(spool)],
        )
    return BarcodeScanResult(
        found=True,
        code=code,
        filament=FilamentPublic.model_validate(filament),
        spool=SpoolPublic.model_validate(spool),
        created=True,
        existing_spools=[SpoolPublic.model_validate(s) for s in existing],
    )


@router.post("/scan/barcode/confirm", response_model=BarcodeScanResult)
def confirm_barcode(payload: BarcodeConfirmRequest, session: SessionDep) -> Any:
    """Create a new filament from a scanned barcode and add its first spool."""
    code = payload.code.strip()
    if payload.request_id:
        replay = session.exec(
            select(Spool).where(Spool.request_id == payload.request_id)
        ).first()
        if replay:
            filament = session.get(Filament, replay.filament_id)
            return BarcodeScanResult(
                found=filament is not None,
                code=replay.barcode or code,
                filament=(
                    FilamentPublic.model_validate(filament) if filament else None
                ),
                spool=SpoolPublic.model_validate(replay),
                created=False,
                existing_spools=[SpoolPublic.model_validate(replay)],
            )
    mapping = session.exec(
        select(FilamentBarcode).where(FilamentBarcode.code == code)
    ).first()
    filament = session.get(Filament, mapping.filament_id) if mapping else None

    if not filament:
        candidate = Filament(**payload.filament.model_dump())
        session.add(candidate)
        session.flush()
        filament = _link_barcode(session=session, code=code, filament=candidate)

    try:
        spool = _create_barcode_spool(
            session=session,
            filament=filament,
            code=code,
            total_weight_g=payload.total_weight_g,
            price_per_kg=payload.price_per_kg,
            request_id=payload.request_id,
        )
    except IntegrityError:
        session.rollback()
        if not payload.request_id:
            raise
        spool = session.exec(
            select(Spool).where(Spool.request_id == payload.request_id)
        ).one()
        filament = session.get(Filament, spool.filament_id)
        return BarcodeScanResult(
            found=True,
            code=spool.barcode or code,
            filament=(FilamentPublic.model_validate(filament) if filament else None),
            spool=SpoolPublic.model_validate(spool),
            created=False,
            existing_spools=[SpoolPublic.model_validate(spool)],
        )
    return BarcodeScanResult(
        found=True,
        code=code,
        filament=FilamentPublic.model_validate(filament),
        spool=SpoolPublic.model_validate(spool),
        created=True,
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
    # A new spool has no printer yet, so it cannot be active. Loading goes
    # through /spools/{id}/activate.
    spool.active = False
    session.add(spool)
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
    if "filament_id" in update_dict and update_dict["filament_id"]:
        if not session.get(Filament, update_dict["filament_id"]):
            raise HTTPException(status_code=404, detail="Filament not found")
    if update_dict.get("active") and spool.printer_id is None:
        raise HTTPException(
            status_code=422,
            detail="Load the spool into a printer before activating it",
        )
    spool.sqlmodel_update(update_dict)
    if "remaining_g" in update_dict:
        # A human-entered weight is real again.
        spool.remaining_unknown = False
    if "active" in update_dict and not spool.active:
        spool.printer_id = None
    # Re-assert after applying the patch: the input may clear printer_id and
    # set active at the same time, which the pre-update check cannot see.
    if spool.active and spool.printer_id is None:
        raise HTTPException(
            status_code=422,
            detail="Load the spool into a printer before activating it",
        )
    if spool.remaining_g > spool.total_weight_g:
        raise HTTPException(
            status_code=422,
            detail="remaining_g cannot exceed total_weight_g",
        )
    session.add(spool)
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
def activate_spool(
    spool_id: uuid.UUID,
    payload: SpoolActivateRequest,
    session: SessionDep,
) -> Any:
    spool = session.get(Spool, spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")
    printer = session.get(Printer, payload.printer_id)
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    _unload_other_spools(
        session=session, printer_id=payload.printer_id, keep_id=spool.id
    )
    spool.printer_id = payload.printer_id
    spool.active = True
    spool.last_used_at = datetime.now(UTC)
    session.add(spool)
    try:
        session.commit()
    except IntegrityError:
        # The partial unique index is the real guard against two requests
        # activating different spools on the same printer at once.
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Another spool is already loaded in that printer",
        )
    session.refresh(spool)
    return spool

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
    SpoolAssignRequest,
    SpoolCreate,
    SpoolPublic,
    SpoolScanRequest,
    SpoolScanResult,
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
        # catalog. Brand, material and colour together identify a product;
        # matching on colour alone would bind a Bambu barcode to another
        # brand's filament.
        filament = session.exec(
            select(Filament)
            .where(
                func.lower(Filament.color_hex) == data["color_hex"].lower(),
                func.lower(Filament.material) == data["material"].lower(),
                func.lower(Filament.brand) == data["brand"].lower(),
            )
            .order_by(col(Filament.created_at).asc())
        ).first()
    if filament:
        return filament

    filament = Filament(
        brand=data["brand"],
        material=data["material"],
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
) -> Spool:
    weight = total_weight_g or filament.spool_weight_g or 1000
    spool = Spool(
        filament_id=filament.id,
        total_weight_g=weight,
        remaining_g=weight,
        barcode=code,
        source="barcode",
        price_per_kg=price_per_kg,
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
    query = select(Spool).where(col(Spool.active).is_(True))
    if printer_id:
        query = query.where(Spool.printer_id == printer_id)
    spool = session.exec(query).first()
    if not spool:
        raise HTTPException(status_code=404, detail="No active spool")
    return spool


@router.post("/scan", response_model=SpoolScanResult)
def scan_nfc(payload: SpoolScanRequest, session: SessionDep) -> Any:
    """Look up a spool by its NFC UID, activating it when found."""
    spool = session.exec(select(Spool).where(Spool.nfc_uid == payload.uid)).first()

    if spool:
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
    spool.active = True
    session.add(spool)
    session.commit()
    session.refresh(spool)
    return SpoolScanResult(
        found=True, uid=payload.uid, spool=SpoolPublic.model_validate(spool)
    )


@router.post("/scan/barcode", response_model=BarcodeScanResult)
def scan_barcode(payload: BarcodeScanRequest, session: SessionDep) -> Any:
    """Look up a packaging barcode and create a spool when it is known."""
    code = payload.code.strip()
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
            suggested_filament=parse_bambu_sku(code),
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

    spool = _create_barcode_spool(session=session, filament=filament, code=code)
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
    mapping = session.exec(
        select(FilamentBarcode).where(FilamentBarcode.code == code)
    ).first()
    filament = session.get(Filament, mapping.filament_id) if mapping else None

    if not filament:
        candidate = Filament(**payload.filament.model_dump())
        session.add(candidate)
        session.flush()
        filament = _link_barcode(session=session, code=code, filament=candidate)

    spool = _create_barcode_spool(
        session=session,
        filament=filament,
        code=code,
        total_weight_g=payload.total_weight_g,
        price_per_kg=payload.price_per_kg,
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
    spool.sqlmodel_update(update_dict)
    if "active" in update_dict and not spool.active:
        spool.printer_id = None
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
    session.commit()
    session.refresh(spool)
    return spool

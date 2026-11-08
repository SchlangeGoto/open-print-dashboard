import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app import crud
from app.api.deps import SessionDep, get_current_user
from app.models import (
    Message,
    Printer,
    PrinterCreate,
    PrinterPublic,
    PrinterUpdate,
)
from app.services.printer_service import printer_service

logger = logging.getLogger("uvicorn.error")

router = APIRouter(
    prefix="/printers",
    tags=["printers"],
    dependencies=[Depends(get_current_user)],
)


def _cloud_devices() -> list[dict]:
    try:
        return printer_service.cloud_client.get_devices()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not load cloud printers: %s", exc)
        return []


def _cloud_statuses() -> dict[str, dict]:
    try:
        statuses = printer_service.cloud_client.get_cloud_print_status()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not load cloud printer status: %s", exc)
        return {}
    return {
        str(status.get("dev_id")): status
        for status in statuses
        if status.get("dev_id")
    }


def _serialize_printers(
    *,
    printer: Printer | None = None,
    cloud_device: dict | None = None,
    status: dict | None = None,
    statuses: dict[str, dict] | None = None,
    cloud_statuses: dict[str, dict] | None = None,
) -> PrinterPublic:
    serial = printer.serial if printer else str(cloud_device.get("dev_id"))
    status = status or (statuses or {}).get(serial) or (cloud_statuses or {}).get(serial)
    connected = bool(status and status.get("connected"))
    cloud_online = bool(cloud_device and cloud_device.get("online"))
    online = connected or cloud_online or bool(status and status.get("gcode_state"))

    return PrinterPublic(
        id=printer.id if printer else None,
        name=printer.name if printer else str(cloud_device.get("name") or serial),
        serial=serial,
        model=cloud_device.get("dev_model_name") if cloud_device else None,
        ip=printer.ip if printer else None,
        access_code=printer.access_code if printer else None,
        online=online,
        configured=printer is not None,
        status={**status, "dev_id": serial} if status else None,
        created_at=printer.created_at if printer else None,
        updated_at=printer.updated_at if printer else None,
    )


def _serialized_printers(session: SessionDep) -> list[PrinterPublic]:
    local_printers = crud.get_printers(session=session)
    cloud_devices = _cloud_devices()
    cloud_devices_by_serial = {
        str(device.get("dev_id")): device
        for device in cloud_devices
        if device.get("dev_id")
    }
    statuses = printer_service.get_statuses()
    cloud_statuses = _cloud_statuses()

    printers: list[PrinterPublic] = []
    seen: set[str] = set()

    for printer in local_printers:
        seen.add(printer.serial)
        printers.append(
            _serialize_printers(
                printer=printer,
                cloud_device=cloud_devices_by_serial.get(printer.serial),
                statuses=statuses,
                cloud_statuses=cloud_statuses,
            )
        )

    for serial, device in cloud_devices_by_serial.items():
        if serial in seen:
            continue
        printers.append(
            _serialize_printers(
                cloud_device=device,
                statuses=statuses,
                cloud_statuses=cloud_statuses,
            )
        )

    return printers


@router.get("/status")
def get_printer_status(session: SessionDep) -> Any:
    """Legacy single-printer status endpoint."""
    printers = crud.get_printers(session=session)
    if not printers:
        return {"connected": False, "status": "no_data"}
    return printer_service.get_status(printers[0].serial)


@router.post("/reconnect", response_model=Message)
def reconnect_printers() -> Any:
    """Reconnect every configured printer."""
    printer_service.reload()
    return Message(message="Printer connections restarted")


@router.get("/tasks")
def get_tasks(limit: int = 20) -> Any:
    return printer_service.cloud_client.get_print_tasks(limit)


@router.get("/cover/{cover_url:path}")
def get_cover(cover_url: str) -> Any:
    image = printer_service.cloud_client.download_cover_image(cover_url)
    if image is None:
        raise HTTPException(status_code=404, detail="Cover image not found")
    return Response(content=image, media_type="image/jpeg")


@router.get("/cloud/status")
def get_cloud_status() -> Any:
    return printer_service.cloud_client.get_cloud_print_status()


@router.get("/projects")
def get_projects() -> Any:
    return printer_service.cloud_client.get_projects()


@router.get("/projects/{project_id}")
def get_project(project_id: str) -> Any:
    return printer_service.cloud_client.get_project(project_id)


@router.get("/messages")
def get_messages() -> Any:
    return printer_service.cloud_client.get_messages()


@router.get("/", response_model=list[PrinterPublic])
def get_printers(session: SessionDep) -> Any:
    """List configured printers and unconfigured printers on the cloud account."""
    return _serialized_printers(session)


@router.post("/", response_model=PrinterPublic)
def create_printer(*, session: SessionDep, printer_in: PrinterCreate) -> Any:
    existing = crud.get_printer_by_serial(session=session, serial=printer_in.serial)
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A printer with this serial number is already configured",
        )
    printer = crud.create_printer(session=session, printer_in=printer_in)
    printer_service.reload()
    return _serialize_printers(
        printer=printer,
        status=printer_service.get_status(printer.serial),
    )


@router.put("/{printer_id}", response_model=PrinterPublic)
def update_printer(
    *, session: SessionDep, printer_id: uuid.UUID, printer_in: PrinterUpdate
) -> Any:
    printer = crud.get_printer(session=session, printer_id=printer_id)
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    printer = crud.update_printer(
        session=session, printer=printer, printer_in=printer_in
    )
    printer_service.reload()
    return _serialize_printers(
        printer=printer,
        status=printer_service.get_status(printer.serial),
    )


@router.delete("/{printer_id}", response_model=Message)
def delete_printer(*, session: SessionDep, printer_id: uuid.UUID) -> Any:
    printer = crud.get_printer(session=session, printer_id=printer_id)
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    serial = printer.serial
    crud.delete_printer(session=session, printer=printer)
    printer_service.reload_printer(serial)
    return Message(message="Printer deleted")


@router.post("/{printer_id}/reconnect", response_model=Message)
def reconnect_printer(*, session: SessionDep, printer_id: uuid.UUID) -> Any:
    printer = crud.get_printer(session=session, printer_id=printer_id)
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    printer_service.reload_printer(printer.serial)
    return Message(message="Printer connection restarted")


@router.get("/{printer_id}/tasks")
def get_printer_tasks(printer_id: str, limit: int = 20) -> Any:
    return printer_service.cloud_client.get_print_tasks_for_printer(printer_id, limit)


@router.get("/{printer_id}/firmware")
def get_printer_firmware(printer_id: str) -> Any:
    return printer_service.cloud_client.get_firmware_info(printer_id)

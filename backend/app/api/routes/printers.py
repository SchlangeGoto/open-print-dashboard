import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel

from app import crud
from app.api.deps import TenantContextDep, require_permission
from app.core.bambu_exceptions import CloudflareError, NotLoggedInError
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
    dependencies=[Depends(require_permission("printers.read"))],
)


class CloudStatus(SQLModel):
    logged_in: bool
    error: str | None = None


def _cloud_devices(context: TenantContextDep) -> list[dict[str, Any]]:
    try:
        return printer_service.get_cloud_client(context.tenant.id).get_devices()
    except NotLoggedInError:
        return []
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not load cloud printers: %s", exc)
        return []


def _cloud_device(context: TenantContextDep, serial: str) -> dict[str, Any] | None:
    for device in _cloud_devices(context):
        if str(device.get("dev_id")) == serial:
            return device
    return None


def _serialize_printers(
    *,
    printer: Printer | None = None,
    cloud_device: dict[str, Any] | None = None,
    status: dict[str, Any] | None = None,
    statuses: dict[str, dict[str, Any]] | None = None,
) -> PrinterPublic:
    if printer is not None:
        serial = printer.serial
    elif cloud_device is not None:
        serial = str(cloud_device.get("dev_id"))
    else:
        raise ValueError("A printer or cloud device is required")

    status = status or (statuses or {}).get(serial)
    connected = bool(status and status.get("connected"))
    cloud_online = bool(cloud_device and cloud_device.get("online"))
    online = connected or cloud_online

    return PrinterPublic(
        id=printer.id if printer else None,
        name=(
            printer.name
            if printer
            else str(cloud_device.get("name") or serial)
            if cloud_device
            else serial
        ),
        serial=serial,
        model=cloud_device.get("dev_model_name") if cloud_device else None,
        online=online,
        configured=printer is not None,
        status={**status, "dev_id": serial} if status else None,
        created_at=printer.created_at if printer else None,
        updated_at=printer.updated_at if printer else None,
    )


def _serialized_printers(context: TenantContextDep) -> list[PrinterPublic]:
    local_printers = crud.get_printers(
        session=context.session, tenant_id=context.tenant.id
    )
    cloud_devices = _cloud_devices(context)
    cloud_devices_by_serial = {
        str(device.get("dev_id")): device
        for device in cloud_devices
        if device.get("dev_id")
    }
    statuses = printer_service.get_statuses(context.tenant.id)

    printers: list[PrinterPublic] = []
    seen: set[str] = set()

    for printer in local_printers:
        seen.add(printer.serial)
        printers.append(
            _serialize_printers(
                printer=printer,
                cloud_device=cloud_devices_by_serial.get(printer.serial),
                statuses=statuses,
            )
        )

    for serial, device in cloud_devices_by_serial.items():
        if serial in seen:
            continue
        printers.append(
            _serialize_printers(
                cloud_device=device,
                statuses=statuses,
            )
        )

    return printers


@router.get("/status")
def get_printer_status(context: TenantContextDep) -> Any:
    """Legacy single-printer status endpoint."""
    printers = crud.get_printers(session=context.session, tenant_id=context.tenant.id)
    if not printers:
        return {"connected": False, "status": "no_data"}
    return printer_service.get_status(context.tenant.id, printers[0].serial)


@router.post(
    "/reconnect",
    response_model=Message,
    dependencies=[Depends(require_permission("printers.write"))],
)
def reconnect_printers(context: TenantContextDep) -> Any:
    """Reconnect every configured printer in the current tenant."""
    printer_service.reload_tenant(context.tenant.id)
    return Message(message="Printer connections restarted")


@router.get("/tasks")
def get_tasks(
    context: TenantContextDep, limit: int = Query(default=20, ge=1, le=1000)
) -> Any:
    return printer_service.get_cloud_client(context.tenant.id).get_print_tasks(limit)


@router.get("/cover/{cover_url:path}")
def get_cover(context: TenantContextDep, cover_url: str) -> Any:
    image = printer_service.get_cloud_client(context.tenant.id).download_cover_image(
        cover_url
    )
    if image is None:
        raise HTTPException(status_code=404, detail="Cover image not found")
    content, media_type = image
    return Response(content=content, media_type=media_type)


@router.get("/cloud/account", response_model=CloudStatus)
def get_cloud_account(context: TenantContextDep) -> Any:
    """Report whether the tenant's Bambu Cloud account is usable, and why not.

    The printer list deliberately degrades to an empty list when the cloud is
    unreachable. This endpoint lets the UI distinguish "no printers" from
    "not signed in", a Cloudflare block, or a network failure.
    """
    client = printer_service.get_cloud_client(context.tenant.id)
    try:
        client.get_devices()
    except NotLoggedInError:
        return CloudStatus(logged_in=False, error="not_logged_in")
    except CloudflareError:
        return CloudStatus(logged_in=True, error="cloudflare")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not reach Bambu Cloud: %s", exc)
        return CloudStatus(logged_in=True, error="unreachable")
    return CloudStatus(logged_in=True)


@router.get("/cloud/status")
def get_cloud_status(context: TenantContextDep) -> Any:
    return printer_service.get_cloud_client(context.tenant.id).get_cloud_print_status()


@router.get("/projects")
def get_projects(context: TenantContextDep) -> Any:
    return printer_service.get_cloud_client(context.tenant.id).get_projects()


@router.get("/projects/{project_id}")
def get_project(context: TenantContextDep, project_id: str) -> Any:
    return printer_service.get_cloud_client(context.tenant.id).get_project(project_id)


@router.get("/messages")
def get_messages(context: TenantContextDep) -> Any:
    return printer_service.get_cloud_client(context.tenant.id).get_messages()


@router.get("/", response_model=list[PrinterPublic])
def get_printers(context: TenantContextDep) -> Any:
    """List configured printers plus printers found on the tenant's account.

    Cloud devices that have not been added to the dashboard yet are returned
    with ``configured=false`` and an ``id`` of null so the UI can offer them.
    """
    return _serialized_printers(context)


@router.post(
    "/",
    response_model=PrinterPublic,
    dependencies=[Depends(require_permission("printers.write"))],
)
def create_printer(*, context: TenantContextDep, printer_in: PrinterCreate) -> Any:
    existing = crud.get_printer_by_serial(
        session=context.session,
        serial=printer_in.serial,
        tenant_id=context.tenant.id,
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A printer with this serial number is already configured",
        )
    try:
        printer = crud.create_printer(
            session=context.session,
            printer_in=printer_in,
            tenant_id=context.tenant.id,
        )
    except IntegrityError:
        # Two concurrent creates can both pass the lookup above; the unique
        # index on (tenant_id, serial) is the real gate.
        context.session.rollback()
        raise HTTPException(
            status_code=409,
            detail="A printer with this serial number is already configured",
        )
    printer_service.reload_printer(context.tenant.id, printer.serial)
    return _serialize_printers(
        printer=printer,
        cloud_device=_cloud_device(context, printer.serial),
        status=printer_service.get_status(context.tenant.id, printer.serial),
    )


@router.put(
    "/{printer_id}",
    response_model=PrinterPublic,
    dependencies=[Depends(require_permission("printers.write"))],
)
def update_printer(
    *, context: TenantContextDep, printer_id: uuid.UUID, printer_in: PrinterUpdate
) -> Any:
    printer = crud.get_printer(
        session=context.session, printer_id=printer_id, tenant_id=context.tenant.id
    )
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    printer = crud.update_printer(
        session=context.session, printer=printer, printer_in=printer_in
    )
    printer_service.reload_printer(context.tenant.id, printer.serial)
    return _serialize_printers(
        printer=printer,
        cloud_device=_cloud_device(context, printer.serial),
        status=printer_service.get_status(context.tenant.id, printer.serial),
    )


@router.delete(
    "/{printer_id}",
    response_model=Message,
    dependencies=[Depends(require_permission("printers.write"))],
)
def delete_printer(*, context: TenantContextDep, printer_id: uuid.UUID) -> Any:
    printer = crud.get_printer(
        session=context.session, printer_id=printer_id, tenant_id=context.tenant.id
    )
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    serial = printer.serial
    crud.delete_printer(session=context.session, printer=printer)
    printer_service.reload_printer(context.tenant.id, serial)
    return Message(message="Printer deleted")


@router.post(
    "/{printer_id}/reconnect",
    response_model=Message,
    dependencies=[Depends(require_permission("printers.write"))],
)
def reconnect_printer(*, context: TenantContextDep, printer_id: uuid.UUID) -> Any:
    printer = crud.get_printer(
        session=context.session, printer_id=printer_id, tenant_id=context.tenant.id
    )
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    printer_service.reload_printer(context.tenant.id, printer.serial)
    return Message(message="Printer connection restarted")


@router.get("/{serial}/tasks")
def get_printer_tasks(
    context: TenantContextDep,
    serial: str,
    limit: int = Query(default=20, ge=1, le=1000),
) -> Any:
    return printer_service.get_cloud_client(
        context.tenant.id
    ).get_print_tasks_for_printer(serial, limit)


@router.get("/{serial}/firmware")
def get_printer_firmware(context: TenantContextDep, serial: str) -> Any:
    return printer_service.get_cloud_client(context.tenant.id).get_firmware_info(serial)

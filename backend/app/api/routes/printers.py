from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.api.deps import get_current_user
from app.models import Message
from app.services.printer_service import printer_service

router = APIRouter(
    prefix="/printers",
    tags=["printers"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/status")
def get_printer_status() -> Any:
    """Latest status reported by the printer over MQTT."""
    return printer_service.client.get_status()


@router.post("/reconnect", response_model=Message)
def reconnect_printer() -> Any:
    """Reconnect to the printer using the currently stored configuration."""
    printer_service.reload()
    return Message(message="Printer connection restarted")


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


@router.get("/")
def get_printers() -> Any:
    """List all printers bound to the signed-in Bambu Lab account."""
    return printer_service.cloud_client.get_devices()


@router.get("/{printer_id}/tasks")
def get_printer_tasks(printer_id: str, limit: int = 20) -> Any:
    return printer_service.cloud_client.get_print_tasks_for_printer(printer_id, limit)


@router.get("/{printer_id}/firmware")
def get_printer_firmware(printer_id: str) -> Any:
    return printer_service.cloud_client.get_firmware_info(printer_id)

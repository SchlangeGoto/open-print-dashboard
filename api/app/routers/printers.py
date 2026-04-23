from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.services.printer_service import printer_service

router = APIRouter()

@router.get("/status")
def get_printer_status():
    return printer_service.client.get_status()

@router.get("/")
def get_printer():
    return printer_service.cloud_client.get_devices()

@router.get("/tasks")
def get_tasks(limit: int = 20):
    return printer_service.cloud_client.get_print_tasks(limit)

@router.get("/{printer_id}/tasks")
def print_file(printer_id: str, limit: int = 20):
    return printer_service.cloud_client.get_print_tasks_for_printer(printer_id, limit)

@router.get("/cover/{cover_url:path}")
def get_cover(cover_url: str):
    image = printer_service.cloud_client.download_cover_image(cover_url)
    if image is None:
        raise HTTPException(status_code=404, detail="Cover image not found")
    return Response(content=image, media_type="image/jpeg")

@router.get("/{printer_id}/firmware")
def get_printer_firmware(printer_id: str):
    return printer_service.cloud_client.get_firmware_info(printer_id)

@router.get("/cloud/status")
def get_cloud_status():
    return printer_service.cloud_client.get_cloud_print_status()

@router.get("/projects/{project_id}")
def get_project(project_id: str):
    return printer_service.cloud_client.get_project(project_id)

@router.get("/projects")
def get_projects():
    return printer_service.cloud_client.get_projects()

@router.get("/messages")
def get_messages():
    return printer_service.cloud_client.get_messages()

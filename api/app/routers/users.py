from fastapi import APIRouter

from app.services.printer_service import printer_service

router = APIRouter()

@router.get("/")
def get_user():
    return printer_service.cloud_client.get_user_profile()
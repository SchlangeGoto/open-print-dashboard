from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import select

from app import crud
from app.api.deps import SessionDep, get_current_user
from app.models import (
    AppSetting,
    PrinterConfig,
    SettingPublic,
)
from app.services.printer_service import printer_service

router = APIRouter(
    prefix="/settings",
    tags=["settings"],
    dependencies=[Depends(get_current_user)],
)

# Keys whose values should never be returned in plain text.
SECRET_KEYS = {"bambu_cloud_password", "bambu_cloud_token", "printer_access_code"}
MASK = "••••••••"


@router.get("/printer", response_model=PrinterConfig)
def read_printer_config(session: SessionDep) -> Any:
    """Return the stored local printer connection settings."""
    config = crud.get_printer_config(session=session)
    return PrinterConfig(
        ip=config["ip"], serial=config["serial"], access_code=config["access_code"]
    )


@router.put("/printer", response_model=PrinterConfig)
def update_printer_config(*, session: SessionDep, config: PrinterConfig) -> Any:
    """Store printer connection settings and reconnect to the printer."""
    crud.save_printer_config(
        session=session,
        ip=config.ip or "",
        serial=config.serial or "",
        access_code=config.access_code or "",
    )
    printer_service.reload()
    return config


@router.get("/", response_model=list[SettingPublic])
def read_settings(session: SessionDep) -> Any:
    """Return all stored settings, masking sensitive values."""
    settings = session.exec(select(AppSetting)).all()
    return [
        SettingPublic(
            key=setting.key,
            value=MASK if setting.key in SECRET_KEYS else setting.value,
        )
        for setting in settings
    ]

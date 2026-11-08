from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import select

from app.api.deps import SessionDep, get_current_user
from app.models import (
    AppSetting,
    SettingPublic,
)

router = APIRouter(
    prefix="/settings",
    tags=["settings"],
    dependencies=[Depends(get_current_user)],
)

# Keys whose values should never be returned in plain text.
SECRET_KEYS = {"bambu_cloud_password", "bambu_cloud_token", "printer_access_code"}
MASK = "••••••••"


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

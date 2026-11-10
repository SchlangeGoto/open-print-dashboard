from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import select

from app.api.deps import SessionDep, get_current_user
from app.core.security import decrypt_secret
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
    result: list[SettingPublic] = []
    for setting in settings:
        if setting.key in SECRET_KEYS:
            value = MASK
        elif setting.key == "bambu_cloud_email":
            try:
                value = decrypt_secret(setting.value)
            except Exception:  # noqa: BLE001 - legacy plaintext values
                value = setting.value
        else:
            value = setting.value
        result.append(SettingPublic(key=setting.key, value=value))
    return result

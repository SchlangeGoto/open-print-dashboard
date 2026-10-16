from typing import Any

from fastapi import APIRouter

from app import crud
from app.api.deps import SessionDep
from app.models import SetupStatus

router = APIRouter(prefix="/setup", tags=["setup"])


@router.get("/status", response_model=SetupStatus)
def get_setup_status(session: SessionDep) -> Any:
    """
    Return which setup steps have been completed.

    This endpoint is intentionally unauthenticated: it is used by the setup
    wizard before any account exists to decide which step to show.
    """
    user_created = crud.count_users(session=session) > 0
    bambu_logged_in = (
        crud.get_setting(session=session, key="bambu_cloud_token") is not None
    )
    printer_configured = (
        crud.get_setting_value(session=session, key="printer_ip") is not None
    )
    return SetupStatus(
        user_created=user_created,
        bambu_logged_in=bambu_logged_in,
        printer_configured=printer_configured,
        setup_complete=user_created and bambu_logged_in and printer_configured,
    )

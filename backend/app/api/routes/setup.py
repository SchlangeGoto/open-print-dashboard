from typing import Any

from fastapi import APIRouter, Depends

from app import crud
from app.api.deps import SessionDep, get_current_user
from app.models import SetupProgress, SetupStatus

router = APIRouter(prefix="/setup", tags=["setup"])


@router.get("/status", response_model=SetupStatus)
def get_setup_status(session: SessionDep) -> Any:
    """
    Return whether setup is needed.

    This endpoint is intentionally unauthenticated, so it exposes only what
    the login/setup redirect needs. Whether a Bambu account is linked or
    printers are configured stays behind ``/setup/progress``.
    """
    user_created = crud.count_users(session=session) > 0
    bambu_logged_in = crud.get_cloud_token(session=session) is not None
    printer_configured = crud.count_printers(session=session) > 0
    return SetupStatus(
        user_created=user_created,
        setup_complete=user_created and bambu_logged_in and printer_configured,
    )


@router.get(
    "/progress",
    response_model=SetupProgress,
    dependencies=[Depends(get_current_user)],
)
def get_setup_progress(session: SessionDep) -> Any:
    """Return the detailed setup step state for the signed-in admin."""
    user_created = crud.count_users(session=session) > 0
    bambu_logged_in = crud.get_cloud_token(session=session) is not None
    printer_configured = crud.count_printers(session=session) > 0
    return SetupProgress(
        user_created=user_created,
        bambu_logged_in=bambu_logged_in,
        printer_configured=printer_configured,
        setup_complete=user_created and bambu_logged_in and printer_configured,
    )

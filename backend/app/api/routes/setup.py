from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import crud
from app.api.deps import TenantContextDep, require_permission
from app.core.db import engine
from app.core.tenancy import DEFAULT_TENANT_ID
from app.models import Message, SetupProgress, SetupStatus

router = APIRouter(prefix="/setup", tags=["setup"])


@router.get("/status", response_model=SetupStatus)
def get_setup_status() -> Any:
    """
    Return whether first-run setup is needed.

    This endpoint is intentionally unauthenticated, so it exposes only what
    the login/setup redirect needs. Until the setup wizard creates a tenant,
    first-run state belongs to the migrated Default tenant.
    """
    with Session(engine) as session:
        user_created = crud.count_users(session=session) > 0
        bambu_logged_in = (
            crud.get_cloud_token(session=session, tenant_id=DEFAULT_TENANT_ID)
            is not None
        )
        printer_configured = (
            crud.count_printers(session=session, tenant_id=DEFAULT_TENANT_ID) > 0
        )
        skipped = (
            crud.get_setting(
                session=session,
                key="setup_skipped",
                tenant_id=DEFAULT_TENANT_ID,
            )
            is not None
        )
    return SetupStatus(
        user_created=user_created,
        setup_complete=user_created
        and (skipped or (bambu_logged_in and printer_configured)),
    )


@router.get("/progress", response_model=SetupProgress)
def get_setup_progress(context: TenantContextDep) -> Any:
    """Return the detailed setup step state for the current tenant."""
    session = context.session
    tenant_id = context.tenant.id
    user_created = crud.count_users(session=session) > 0
    bambu_logged_in = (
        crud.get_cloud_token(session=session, tenant_id=tenant_id) is not None
    )
    printer_configured = crud.count_printers(session=session, tenant_id=tenant_id) > 0
    skipped = (
        crud.get_setting(session=session, key="setup_skipped", tenant_id=tenant_id)
        is not None
    )
    return SetupProgress(
        user_created=user_created,
        bambu_logged_in=bambu_logged_in,
        printer_configured=printer_configured,
        setup_complete=user_created
        and (skipped or (bambu_logged_in and printer_configured)),
    )


@router.post(
    "/skip",
    response_model=Message,
    dependencies=[Depends(require_permission("settings.write"))],
)
def skip_setup(context: TenantContextDep) -> Any:
    """Let a tenant admin finish setup without binding a printer."""
    skipped = crud.get_setting(
        session=context.session,
        key="setup_skipped",
        tenant_id=context.tenant.id,
    )
    if skipped is None:
        crud.set_setting(
            session=context.session,
            key="setup_skipped",
            value="true",
            tenant_id=context.tenant.id,
        )
    return Message(message="Setup skipped")

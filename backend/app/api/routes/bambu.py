import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel

from app import crud
from app.api.deps import TenantContextDep, require_permission
from app.core.bambu_exceptions import (
    CloudflareError,
    CodeExpiredError,
    CodeIncorrectError,
    CodeRequiredError,
)
from app.core.store import get_cloud_token
from app.models import Message
from app.services.printer_service import printer_service

logger = logging.getLogger("uvicorn.error")

router = APIRouter(
    prefix="/bambu",
    tags=["bambu"],
    dependencies=[Depends(require_permission("bambu.manage"))],
)


class BambuLoginRequest(SQLModel):
    email: str
    password: str


class BambuVerifyRequest(SQLModel):
    code: str


_pending_logins: set[uuid.UUID] = set()


@router.post("/login/start")
def login_start(context: TenantContextDep, payload: BambuLoginRequest) -> Any:
    """
    Start a Bambu Lab cloud login for the current tenant. Some accounts require
    an email code before the login completes; in that case ``requireCode`` is
    returned.
    """
    tenant_id = context.tenant.id
    client = printer_service.get_cloud_client(tenant_id)
    if get_cloud_token(tenant_id) and client.is_token_valid():
        raise HTTPException(status_code=400, detail="Already logged in")

    client.email = payload.email
    client.password = payload.password
    try:
        printer_service.login(tenant_id)
        _pending_logins.discard(tenant_id)
        crud.record_audit(
            session=context.session,
            tenant_id=tenant_id,
            user_id=context.user.id,
            action="bambu.login",
        )
        return {"message": "Login successful"}
    except CodeRequiredError:
        _pending_logins.add(tenant_id)
        return {"requireCode": True, "message": "Check your email for a code"}
    except CloudflareError:
        raise HTTPException(
            status_code=503, detail="Blocked by Cloudflare, try again later"
        )
    except Exception:
        # Never reflect upstream/Bambu error text (hosts, account ids).
        logger.exception("Bambu Cloud login failed")
        raise HTTPException(status_code=500, detail="Could not sign in to Bambu Cloud")


@router.post("/login/verify")
def login_verify(context: TenantContextDep, payload: BambuVerifyRequest) -> Any:
    """
    Complete a Bambu Lab cloud login with the emailed verification code.
    """
    tenant_id = context.tenant.id
    if tenant_id not in _pending_logins:
        raise HTTPException(status_code=400, detail="No pending login session")

    try:
        printer_service.login(tenant_id, payload.code)
        _pending_logins.discard(tenant_id)
        crud.record_audit(
            session=context.session,
            tenant_id=tenant_id,
            user_id=context.user.id,
            action="bambu.login",
        )
        return {"message": "Login successful"}
    except CodeExpiredError:
        return {
            "codeExpired": True,
            "message": "Code expired — a new one has been sent to your email",
        }
    except CodeIncorrectError:
        raise HTTPException(status_code=400, detail="Incorrect code, try again")
    except Exception:
        logger.exception("Bambu Cloud verification failed")
        raise HTTPException(
            status_code=500, detail="Could not verify the Bambu Cloud code"
        )


@router.get("/profile")
def get_profile(context: TenantContextDep) -> Any:
    """
    Return the tenant's Bambu Lab account profile. Also validates the token.
    """
    return printer_service.get_cloud_client(context.tenant.id).get_user_profile()


@router.delete("/session", response_model=Message)
def delete_session(context: TenantContextDep) -> Any:
    """Sign out of the tenant's Bambu Cloud account and forget its credentials."""
    tenant_id = context.tenant.id
    _pending_logins.discard(tenant_id)
    crud.clear_cloud_credentials(session=context.session, tenant_id=tenant_id)
    printer_service.disconnect_tenant(tenant_id)
    printer_service.get_cloud_client(tenant_id).reset_session()
    crud.record_audit(
        session=context.session,
        tenant_id=tenant_id,
        user_id=context.user.id,
        action="bambu.logout",
    )
    return Message(message="Bambu Lab session cleared")

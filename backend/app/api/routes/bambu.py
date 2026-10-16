from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel

from app.api.deps import get_current_user
from app.core.bambu_exceptions import (
    CloudflareError,
    CodeExpiredError,
    CodeIncorrectError,
    CodeRequiredError,
)
from app.core.store import get_cloud_token
from app.services.printer_service import printer_service

router = APIRouter(
    prefix="/bambu",
    tags=["bambu"],
    dependencies=[Depends(get_current_user)],
)


class BambuLoginRequest(SQLModel):
    email: str
    password: str


class BambuVerifyRequest(SQLModel):
    code: str


_pending_login = False


@router.post("/login/start")
def login_start(payload: BambuLoginRequest) -> Any:
    """
    Start a Bambu Lab cloud login. Some accounts require an email code before
    the login completes; in that case ``requireCode`` is returned.
    """
    if get_cloud_token():
        raise HTTPException(status_code=400, detail="Already logged in")

    global _pending_login
    printer_service.cloud_client.email = payload.email
    printer_service.cloud_client.password = payload.password
    try:
        printer_service.login()
        return {"message": "Login successful"}
    except CodeRequiredError:
        _pending_login = True
        return {"requireCode": True, "message": "Check your email for a code"}
    except CloudflareError:
        raise HTTPException(
            status_code=503, detail="Blocked by Cloudflare, try again later"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login/verify")
def login_verify(payload: BambuVerifyRequest) -> Any:
    """
    Complete a Bambu Lab cloud login with the emailed verification code.
    """
    global _pending_login
    if not _pending_login:
        raise HTTPException(status_code=400, detail="No pending login session")

    try:
        printer_service.login(payload.code)
        _pending_login = False
        return {"message": "Login successful"}
    except CodeExpiredError:
        return {
            "codeExpired": True,
            "message": "Code expired — a new one has been sent to your email",
        }
    except CodeIncorrectError:
        raise HTTPException(status_code=400, detail="Incorrect code, try again")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profile")
def get_profile() -> Any:
    """
    Return the Bambu Lab account profile. Also validates the stored token.
    """
    return printer_service.cloud_client.get_user_profile()

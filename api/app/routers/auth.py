from fastapi import APIRouter, HTTPException

from app.db.crud import get_cloud_token
from app.schemas.auth import LoginStartRequest, LoginVerifyRequest
from app.services.printer_service import printer_service
from app.core.bambu_exceptions import (
    CloudflareError,
    CodeRequiredError,
    CodeExpiredError,
    CodeIncorrectError,
)

router = APIRouter()

_pending_login = False

@router.post("/login/start")
def login_start(payload: LoginStartRequest):

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
        raise HTTPException(status_code=503, detail="Blocked by Cloudflare, try again later")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login/verify")
def login_verify(payload: LoginVerifyRequest):
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
            "message": "Code expired — a new one has been sent to your email"
        }

    except CodeIncorrectError:
        raise HTTPException(status_code=400, detail="Incorrect code, try again")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


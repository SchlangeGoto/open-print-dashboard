import hashlib
import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db.database import get_session
from app.db.models import User, Settings
from app.services.printer_service import printer_service

router = APIRouter()


class UserCreate(BaseModel):
    username: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


@router.get("/")
def get_user():
    return printer_service.cloud_client.get_user_profile()


@router.get("/exists")
def user_exists(session: Session = Depends(get_session)):
    """Check if any local user account has been created (setup done?)."""
    user = session.exec(select(User)).first()
    return {"exists": user is not None}


@router.post("/register")
def register_user(payload: UserCreate, session: Session = Depends(get_session)):
    """Create the default admin user — only works if no user exists yet."""
    existing = session.exec(select(User)).first()
    if existing:
        raise HTTPException(status_code=400, detail="A user already exists")

    salt = secrets.token_hex(16)
    password_hash = _hash_password(payload.password, salt)

    user = User(username=payload.username, password_hash=f"{salt}:{password_hash}")
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"ok": True, "username": user.username}


@router.post("/login")
def login_user(payload: UserLogin, session: Session = Depends(get_session)):
    """Validate local user credentials."""
    user = session.exec(select(User).where(User.username == payload.username)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    salt, stored_hash = user.password_hash.split(":", 1)
    if _hash_password(payload.password, salt) != stored_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"ok": True, "username": user.username}


@router.get("/setup-status")
def get_setup_status(session: Session = Depends(get_session)):
    """Return which setup steps are completed."""
    user_done = session.exec(select(User)).first() is not None
    bambu_done = session.get(Settings, "bambu_cloud_token") is not None
    printer_done = session.get(Settings, "printer_ip") is not None

    return {
        "user_created": user_done,
        "bambu_logged_in": bambu_done,
        "printer_configured": printer_done,
        "setup_complete": user_done and bambu_done and printer_done,
    }
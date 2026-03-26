from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db.database import get_session
from app.db.models import Settings

router = APIRouter()

@router.post("/")
def create_setting(setting: Settings, session: Session = Depends(get_session)):
    existing = session.get(Settings, setting.key)
    if existing:
        existing.value = setting.value
    else:
        session.add(Settings(key=setting.key, value=setting.value))
    session.commit()
    return setting

@router.get("/")
def get_settings(session: Session = Depends(get_session)):
    return session.exec(select(Settings)).all()

@router.get("/{key}")
def get_setting(key: str, session: Session = Depends(get_session)):
    setting = session.get(Settings, key)
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting
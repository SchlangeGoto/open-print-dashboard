from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.db.database import get_session, engine
from app.db.models import Settings

router = APIRouter()

@router.post("/")
def create_setting(setting: Settings, session: Session = Depends(get_session)):
    with Session(engine) as session:
        existing = session.get(Settings, "bambu_cloud_token")
        if existing:
            existing.value = setting.value
        else:
            session.add(Settings(key=setting.key, value=existing.value))
        session.commit()
        return existing

@router.get("/")
def get_settings(session: Session = Depends(get_session)):
    return session.exec(select(Settings)).all()
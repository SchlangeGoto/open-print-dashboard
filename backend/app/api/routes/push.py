from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import Message, PushToken, PushTokenCreate, PushTokenPublic

router = APIRouter(prefix="/push", tags=["push"])


@router.post("/register", response_model=PushTokenPublic)
def register_push_token(
    *, session: SessionDep, current_user: CurrentUser, payload: PushTokenCreate
) -> Any:
    platform = payload.platform.strip().lower()[:20] or "unknown"
    if platform not in ("ios", "android", "unknown"):
        raise HTTPException(status_code=422, detail="Unsupported platform")
    token = payload.token.strip()
    existing = session.exec(select(PushToken).where(PushToken.token == token)).first()
    if existing:
        existing.user_id = current_user.id
        existing.platform = platform
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    row = PushToken(user_id=current_user.id, token=token, platform=platform)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/{token}", response_model=Message)
def unregister_push_token(
    *, session: SessionDep, current_user: CurrentUser, token: str
) -> Any:
    row = session.exec(
        select(PushToken)
        .where(PushToken.token == token)
        .where(PushToken.user_id == current_user.id)
    ).first()
    if row:
        session.delete(row)
        session.commit()
    return Message(message="Push token removed")

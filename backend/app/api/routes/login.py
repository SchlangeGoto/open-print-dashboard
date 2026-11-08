import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import or_
from sqlmodel import Session, col, select

from app import crud
from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.core import security
from app.core.config import settings
from app.models import (
    Message,
    NewPassword,
    RefreshToken,
    RefreshTokenRequest,
    Token,
    User,
    UserPublic,
    UserUpdate,
)
from app.utils import (
    generate_password_reset_token,
    generate_reset_password_email,
    send_email,
    verify_password_reset_token,
)

router = APIRouter(tags=["login"])

REFRESH_TOKEN_RETENTION_DAYS = 30


def _as_utc(value: datetime) -> datetime:
    """Normalize database datetimes, which may come back without a timezone."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _refresh_error(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _revoke_all_refresh_tokens(
    session: Session, user_id: uuid.UUID, now: datetime
) -> None:
    tokens = session.exec(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            col(RefreshToken.revoked_at).is_(None),
        )
    ).all()
    for token in tokens:
        token.revoked_at = now
        session.add(token)


def _purge_stale_refresh_tokens(session: Session, user_id: uuid.UUID) -> None:
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=REFRESH_TOKEN_RETENTION_DAYS)
    stale = session.exec(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            or_(
                col(RefreshToken.expires_at) < now,
                col(RefreshToken.revoked_at) < cutoff,
            ),
        )
    ).all()
    for token in stale:
        session.delete(token)


def _issue_token_pair(session: Session, user: User) -> Token:
    """Create an access token plus a fresh, rotating refresh token."""
    _purge_stale_refresh_tokens(session, user.id)
    raw_refresh_token = security.generate_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=security.hash_refresh_token(raw_refresh_token),
            expires_at=datetime.now(UTC)
            + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    session.commit()
    return Token(
        access_token=security.create_access_token(
            user.id,
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        ),
        refresh_token=raw_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/login/access-token")
def login_access_token(
    session: SessionDep, form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> Token:
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    user = crud.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return _issue_token_pair(session, user)


@router.post("/login/refresh")
def refresh_access_token(session: SessionDep, body: RefreshTokenRequest) -> Token:
    """Rotate a refresh token and issue a new access token.

    Refresh tokens are single-use. Reusing an already rotated token outside a
    short retry window revokes every session for that user, which limits the
    damage from a stolen token.
    """
    token_hash = security.hash_refresh_token(body.refresh_token)
    stored = session.exec(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .with_for_update()
    ).first()
    now = datetime.now(UTC)

    if not stored:
        raise _refresh_error("Invalid refresh token")

    if _as_utc(stored.expires_at) <= now:
        session.delete(stored)
        session.commit()
        raise _refresh_error("Refresh token expired")

    if stored.revoked_at is not None:
        revoked_at = _as_utc(stored.revoked_at)
        grace = timedelta(seconds=settings.REFRESH_TOKEN_REUSE_GRACE_SECONDS)
        if now - revoked_at <= grace:
            # A racing tab or a retried request. Reject the old token but do
            # not punish the other active sessions.
            raise _refresh_error("Refresh token already rotated")
        _revoke_all_refresh_tokens(session, stored.user_id, now)
        session.commit()
        raise _refresh_error("Refresh token reuse detected")

    user = session.get(User, stored.user_id)
    if not user or not user.is_active:
        stored.revoked_at = now
        session.add(stored)
        session.commit()
        raise _refresh_error("Inactive user")

    stored.revoked_at = now
    session.add(stored)
    return _issue_token_pair(session, user)


@router.post("/login/logout")
def logout(session: SessionDep, body: RefreshTokenRequest) -> Message:
    """Revoke a refresh token. Invalid tokens are accepted idempotently."""
    token_hash = security.hash_refresh_token(body.refresh_token)
    stored = session.exec(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).first()
    if stored and stored.revoked_at is None:
        stored.revoked_at = datetime.now(UTC)
        session.add(stored)
        session.commit()
    return Message(message="Logged out")


@router.post("/login/test-token", response_model=UserPublic)
def test_token(current_user: CurrentUser) -> Any:
    """
    Test access token.
    """
    return current_user


@router.post("/password-recovery/{email}")
def recover_password(email: str, session: SessionDep) -> Message:
    """
    Password Recovery.
    """
    user = crud.get_user_by_email(session=session, email=email)

    # Always return the same response to prevent email enumeration attacks.
    # Only send an email if the user actually exists and email is configured.
    if user and settings.emails_enabled:
        password_reset_token = generate_password_reset_token(email=email)
        email_data = generate_reset_password_email(
            email_to=user.email, email=email, token=password_reset_token
        )
        send_email(
            email_to=user.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return Message(
        message="If that email is registered, we sent a password recovery link"
    )


@router.post("/reset-password/")
def reset_password(session: SessionDep, body: NewPassword) -> Message:
    """
    Reset password.
    """
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token")
    user = crud.get_user_by_email(session=session, email=email)
    if not user:
        # Don't reveal that the user doesn't exist - use the same error as an
        # invalid token.
        raise HTTPException(status_code=400, detail="Invalid token")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    crud.update_user(
        session=session,
        db_user=user,
        user_in=UserUpdate(password=body.new_password),
    )
    crud.revoke_user_refresh_tokens(session=session, user_id=user.id)
    return Message(message="Password updated successfully")


@router.post(
    "/password-recovery-html-content/{email}",
    dependencies=[Depends(get_current_active_superuser)],
    response_class=HTMLResponse,
)
def recover_password_html_content(email: str, session: SessionDep) -> Any:
    """
    HTML Content for Password Recovery (useful for previewing emails).
    """
    user = crud.get_user_by_email(session=session, email=email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this email does not exist in the system.",
        )
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )
    return HTMLResponse(
        content=email_data.html_content, headers={"subject": email_data.subject}
    )

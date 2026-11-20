from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import Session

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.core import security
from app.models import (
    Message,
    Tenant,
    TenantInvite,
    TenantInviteAccept,
    TenantInviteInfo,
    TenantInviteRegister,
    TenantMembershipPublic,
    UserCreate,
)

router = APIRouter(prefix="/invites", tags=["invites"])


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _usable_invite(*, session: Session, token: str) -> TenantInvite:
    token_hash = security.hash_refresh_token(token)
    invite = crud.get_invite_by_token_hash(session=session, token_hash=token_hash)
    if invite is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invite.accepted_at is not None:
        raise HTTPException(status_code=400, detail="Invitation was already used")
    if invite.revoked_at is not None:
        raise HTTPException(status_code=400, detail="Invitation was revoked")
    if _as_utc(invite.expires_at) <= datetime.now(UTC):
        raise HTTPException(status_code=400, detail="Invitation expired")
    return invite


@router.get("/{token}", response_model=TenantInviteInfo)
def read_invite(token: str, session: SessionDep) -> Any:
    """Public invitation details for the accept page."""
    invite = _usable_invite(session=session, token=token)
    tenant = session.get(Tenant, invite.tenant_id)
    if tenant is None or not tenant.is_active:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return TenantInviteInfo(
        tenant_name=tenant.name,
        tenant_slug=tenant.slug,
        email=invite.email,
        role=invite.role,
        expires_at=invite.expires_at,
        valid=True,
    )


@router.post("/accept", response_model=TenantMembershipPublic)
def accept_invite(
    *, session: SessionDep, current_user: CurrentUser, body: TenantInviteAccept
) -> Any:
    """Add the signed-in user to the inviting tenant."""
    invite = _usable_invite(session=session, token=body.token)
    if current_user.email.lower() != str(invite.email).lower():
        raise HTTPException(
            status_code=403,
            detail="Sign in with the email address that was invited",
        )
    tenant = session.get(Tenant, invite.tenant_id)
    if tenant is None or not tenant.is_active:
        raise HTTPException(status_code=404, detail="Invitation not found")

    membership = crud.ensure_membership(
        session=session,
        tenant_id=tenant.id,
        user_id=current_user.id,
        role=invite.role,
    )
    invite.accepted_at = datetime.now(UTC)
    session.add(invite)
    session.commit()
    return TenantMembershipPublic(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        is_active=tenant.is_active,
        role=membership.role,
    )


@router.post("/register", response_model=Message)
def register_from_invite(*, session: SessionDep, body: TenantInviteRegister) -> Any:
    """Create an account for an invited email and join the tenant."""
    invite = _usable_invite(session=session, token=body.token)
    existing = crud.get_user_by_email(session=session, email=str(invite.email))
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="An account already exists; sign in to accept the invitation",
        )
    tenant = session.get(Tenant, invite.tenant_id)
    if tenant is None or not tenant.is_active:
        raise HTTPException(status_code=404, detail="Invitation not found")

    user = crud.create_user(
        session=session,
        user_create=UserCreate(
            email=invite.email,
            password=body.password,
            full_name=body.full_name,
        ),
    )
    crud.ensure_membership(
        session=session,
        tenant_id=tenant.id,
        user_id=user.id,
        role=invite.role,
    )
    invite.accepted_at = datetime.now(UTC)
    session.add(invite)
    session.commit()
    return Message(message="Account created. Sign in to continue.")

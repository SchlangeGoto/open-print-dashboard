import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select

from app import crud
from app.api.deps import SessionDep, require_provisioning_token
from app.core import security
from app.core.config import settings
from app.core.tenancy import DEFAULT_TENANT_ID
from app.models import (
    InternalTenantCreate,
    InternalTenantResult,
    InternalTenantUpdate,
    Tenant,
    TenantCreate,
    TenantHealth,
    TenantInvite,
    TenantPublic,
)
from app.services.printer_service import printer_service
from app.services.tenant_health import build_tenant_health

router = APIRouter(
    prefix="/internal",
    tags=["internal"],
    dependencies=[Depends(require_provisioning_token)],
)


def _invite_url(token: str) -> str:
    return f"{settings.FRONTEND_HOST}/invite?token={token}"


def _ensure_owner(
    *, session: SessionDep, tenant: Tenant, owner_email: str
) -> str | None:
    """Make the billing email the owner, or return a one-time invite link."""
    email = owner_email.lower()
    user = crud.get_user_by_email(session=session, email=email)
    if user is not None:
        crud.ensure_membership(
            session=session,
            tenant_id=tenant.id,
            user_id=user.id,
            role="owner",
        )
        return None

    now = datetime.now(UTC)
    pending = session.exec(
        select(TenantInvite).where(
            TenantInvite.tenant_id == tenant.id,
            TenantInvite.email == email,
            col(TenantInvite.accepted_at).is_(None),
            col(TenantInvite.revoked_at).is_(None),
        )
    ).all()
    for invite in pending:
        invite.revoked_at = now
        session.add(invite)
    session.flush()

    raw_token = secrets.token_urlsafe(32)
    crud.create_invite(
        session=session,
        tenant_id=tenant.id,
        email=email,
        role="owner",
        token_hash=security.hash_refresh_token(raw_token),
        expires_at=now + timedelta(days=settings.TENANT_INVITE_EXPIRE_DAYS),
        invited_by=None,
    )
    return _invite_url(raw_token)


def _result(
    *,
    session: SessionDep,
    tenant: Tenant,
    owner_email: str,
    created: bool,
) -> InternalTenantResult:
    invite_url = _ensure_owner(session=session, tenant=tenant, owner_email=owner_email)
    return InternalTenantResult(
        tenant=TenantPublic.model_validate(tenant),
        owner_email=owner_email,
        invite_url=invite_url,
        created=created,
    )


@router.post("/tenants", response_model=InternalTenantResult)
def provision_tenant(
    *,
    session: SessionDep,
    tenant_in: InternalTenantCreate,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")],
) -> Any:
    """Create a tenant for the hosted control plane, idempotently."""
    key = idempotency_key.strip()
    if not key or len(key) > 100:
        raise HTTPException(
            status_code=422, detail="Idempotency-Key must be 1-100 characters"
        )

    existing = crud.get_tenant_by_external_id(session=session, external_id=key)
    if existing is not None:
        return _result(
            session=session,
            tenant=existing,
            owner_email=str(tenant_in.owner_email),
            created=False,
        )

    if crud.get_tenant_by_slug(session=session, slug=tenant_in.slug):
        raise HTTPException(status_code=409, detail="Tenant slug already exists")

    try:
        tenant = crud.create_tenant(
            session=session,
            tenant_in=TenantCreate(name=tenant_in.name, slug=tenant_in.slug),
            external_id=key,
        )
    except IntegrityError:
        session.rollback()
        # A concurrent retry with the same key won the race.
        existing = crud.get_tenant_by_external_id(session=session, external_id=key)
        if existing is None:
            raise HTTPException(status_code=409, detail="Tenant slug already exists")
        return _result(
            session=session,
            tenant=existing,
            owner_email=str(tenant_in.owner_email),
            created=False,
        )

    crud.record_audit(
        session=session,
        tenant_id=tenant.id,
        user_id=None,
        action="tenant.provision",
        target=tenant.slug,
        details=str(tenant_in.owner_email),
    )
    return _result(
        session=session,
        tenant=tenant,
        owner_email=str(tenant_in.owner_email),
        created=True,
    )


@router.get("/tenants/{tenant_id}", response_model=TenantPublic)
def read_tenant(*, session: SessionDep, tenant_id: uuid.UUID) -> Any:
    tenant = crud.get_tenant(session=session, tenant_id=tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.patch("/tenants/{tenant_id}", response_model=TenantPublic)
def update_tenant(
    *,
    session: SessionDep,
    tenant_id: uuid.UUID,
    tenant_in: InternalTenantUpdate,
) -> Any:
    tenant = crud.get_tenant(session=session, tenant_id=tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if tenant.id == DEFAULT_TENANT_ID:
        raise HTTPException(
            status_code=400, detail="The Default tenant cannot be changed here"
        )
    tenant.is_active = tenant_in.is_active
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    if not tenant.is_active:
        printer_service.disconnect_tenant(tenant.id)
    crud.record_audit(
        session=session,
        tenant_id=tenant.id,
        user_id=None,
        action="tenant.provision_state",
        target=tenant.slug,
        details="active" if tenant.is_active else "inactive",
    )
    return tenant


@router.get("/tenants/{tenant_id}/health", response_model=TenantHealth)
def read_tenant_health(*, session: SessionDep, tenant_id: uuid.UUID) -> Any:
    tenant = crud.get_tenant(session=session, tenant_id=tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return build_tenant_health(session, tenant)

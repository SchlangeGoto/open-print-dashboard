import secrets
import uuid
from collections.abc import Callable, Generator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlmodel import Session

from app import crud
from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.core.tenancy import has_permission
from app.models import Membership, Tenant, TokenPayload, User

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

TENANT_NOT_FOUND = HTTPException(status_code=404, detail="Tenant not found")


def get_db() -> Generator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise CREDENTIALS_ERROR
    if token_data.sub is None:
        raise CREDENTIALS_ERROR
    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    if user.sessions_revoked_at is not None:
        if token_data.iat is None:
            raise CREDENTIALS_ERROR
        revoked_at = user.sessions_revoked_at
        if revoked_at.tzinfo is None:
            revoked_at = revoked_at.replace(tzinfo=UTC)
        if datetime.fromtimestamp(token_data.iat, UTC) < revoked_at:
            raise CREDENTIALS_ERROR
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_active_superuser(current_user: CurrentUser) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user


@dataclass
class TenantContext:
    """The authenticated request's tenant and the caller's role in it."""

    session: Session
    user: User
    tenant: Tenant
    role: str
    membership: Membership | None = None

    @property
    def tenant_id(self) -> uuid.UUID:
        return self.tenant.id


TenantIdHeader = Annotated[str | None, Header(alias="X-Tenant-ID")]
TenantSlugHeader = Annotated[str | None, Header(alias="X-Tenant-Slug")]


def _tenant_choice_error(tenants: list[dict[str, object]]) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "code": "tenant_required",
            "message": "Choose a tenant with X-Tenant-ID or X-Tenant-Slug",
            "tenants": tenants,
        },
    )


def _membership_tenant(
    *, session: Session, user: User, memberships: list[Membership]
) -> TenantContext:
    tenants: list[dict[str, object]] = []
    active: list[tuple[Tenant, Membership]] = []
    for membership in memberships:
        tenant = session.get(Tenant, membership.tenant_id)
        if tenant is None:
            continue
        tenants.append(
            {
                "id": str(tenant.id),
                "name": tenant.name,
                "slug": tenant.slug,
                "role": membership.role,
                "is_active": tenant.is_active,
            }
        )
        if tenant.is_active:
            active.append((tenant, membership))

    if len(active) == 1:
        tenant, membership = active[0]
        return TenantContext(
            session=session,
            user=user,
            tenant=tenant,
            role=membership.role,
            membership=membership,
        )
    if len(active) > 1:
        raise _tenant_choice_error(tenants)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="The user is not a member of an active tenant",
    )


def _superuser_tenant(
    *, session: Session, user: User, tenant_id: str | None, tenant_slug: str | None
) -> TenantContext:
    """Resolve a platform admin to a tenant without requiring a membership."""
    if tenant_id:
        try:
            tenant_uuid = uuid.UUID(tenant_id)
        except ValueError:
            raise TENANT_NOT_FOUND
        tenant = crud.get_tenant(session=session, tenant_id=tenant_uuid)
    elif tenant_slug:
        tenant = crud.get_tenant_by_slug(session=session, slug=tenant_slug)
    else:
        active = crud.get_tenants(session=session, active_only=True)
        if len(active) == 1:
            tenant = active[0]
        elif active:
            raise _tenant_choice_error(
                [
                    {
                        "id": str(item.id),
                        "name": item.name,
                        "slug": item.slug,
                        "role": "owner",
                        "is_active": item.is_active,
                    }
                    for item in active
                ]
            )
        else:
            raise TENANT_NOT_FOUND

    if tenant is None or not tenant.is_active:
        raise TENANT_NOT_FOUND
    if tenant_slug and tenant.slug != tenant_slug:
        raise TENANT_NOT_FOUND
    membership = crud.get_membership(
        session=session, tenant_id=tenant.id, user_id=user.id
    )
    return TenantContext(
        session=session,
        user=user,
        tenant=tenant,
        role="owner",
        membership=membership,
    )


def get_tenant_context(
    session: SessionDep,
    current_user: CurrentUser,
    x_tenant_id: TenantIdHeader = None,
    x_tenant_slug: TenantSlugHeader = None,
) -> TenantContext:
    """Resolve the request tenant.

    A header is required once a user belongs to more than one tenant. With one
    active membership, omitting the header keeps existing single-tenant clients
    working. Unknown tenants and tenants the caller cannot see both return 404
    so the endpoint cannot be used to enumerate tenants.
    """
    if x_tenant_id or x_tenant_slug:
        if current_user.is_superuser:
            return _superuser_tenant(
                session=session,
                user=current_user,
                tenant_id=x_tenant_id,
                tenant_slug=x_tenant_slug,
            )
        if x_tenant_id:
            try:
                tenant_uuid = uuid.UUID(x_tenant_id)
            except ValueError:
                raise TENANT_NOT_FOUND
            tenant = crud.get_tenant(session=session, tenant_id=tenant_uuid)
        else:
            tenant = crud.get_tenant_by_slug(session=session, slug=x_tenant_slug or "")
        if tenant is None or not tenant.is_active:
            raise TENANT_NOT_FOUND
        membership = crud.get_membership(
            session=session, tenant_id=tenant.id, user_id=current_user.id
        )
        if membership is None:
            raise TENANT_NOT_FOUND
        return TenantContext(
            session=session,
            user=current_user,
            tenant=tenant,
            role=membership.role,
            membership=membership,
        )

    memberships = crud.list_user_memberships(session=session, user_id=current_user.id)
    if current_user.is_superuser:
        active: list[tuple[Tenant, Membership]] = []
        choices: list[dict[str, object]] = []
        for membership in memberships:
            tenant = session.get(Tenant, membership.tenant_id)
            if tenant is None:
                continue
            choices.append(
                {
                    "id": str(tenant.id),
                    "name": tenant.name,
                    "slug": tenant.slug,
                    "role": "owner",
                    "is_active": tenant.is_active,
                }
            )
            if tenant.is_active:
                active.append((tenant, membership))
        if len(active) == 1:
            tenant, membership = active[0]
            return TenantContext(
                session=session,
                user=current_user,
                tenant=tenant,
                role="owner",
                membership=membership,
            )
        if len(active) > 1:
            raise _tenant_choice_error(choices)
        return _superuser_tenant(
            session=session,
            user=current_user,
            tenant_id=None,
            tenant_slug=None,
        )
    return _membership_tenant(
        session=session, user=current_user, memberships=memberships
    )


TenantContextDep = Annotated[TenantContext, Depends(get_tenant_context)]


def require_permission(permission: str) -> Callable[[TenantContext], TenantContext]:
    def _check(context: TenantContextDep) -> TenantContext:
        if not has_permission(context.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The user doesn't have enough privileges",
            )
        return context

    return _check


def require_tenant_admin(context: TenantContextDep) -> TenantContext:
    if context.role not in {"owner", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant admin privileges required",
        )
    return context


def require_provisioning_token(
    x_provisioning_token: Annotated[
        str | None, Header(alias="X-Provisioning-Token")
    ] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Authenticate the hosted control plane against the internal API.

    The token is a deployment secret, not a user JWT. Internal routes are not
    registered for public use; reverse proxies should also block them.
    """
    expected = settings.PROVISIONING_TOKEN
    if not expected:
        raise HTTPException(status_code=404, detail="Not found")
    token = x_provisioning_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    if not token or not secrets.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid provisioning token",
        )

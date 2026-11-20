from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError

from app import crud
from app.api.deps import (
    CurrentUser,
    SessionDep,
    TenantContextDep,
    get_current_active_superuser,
    require_permission,
)
from app.models import (
    Tenant,
    TenantCreate,
    TenantMembershipPublic,
    TenantPublic,
    TenantsPublic,
    TenantUpdate,
)

router = APIRouter(tags=["tenants"])


@router.get("/me/tenants", response_model=TenantsPublic)
def read_my_tenants(session: SessionDep, current_user: CurrentUser) -> Any:
    """Return the tenants the caller can switch to.

    Platform superusers see every active tenant: they may switch to any of
    them without a membership.
    """
    items: list[TenantMembershipPublic] = []
    if current_user.is_superuser:
        tenants = crud.get_tenants(session=session, active_only=True)
        return TenantsPublic(
            data=[
                TenantMembershipPublic(
                    id=tenant.id,
                    name=tenant.name,
                    slug=tenant.slug,
                    is_active=tenant.is_active,
                    role="owner",
                )
                for tenant in tenants
            ],
            count=len(tenants),
        )

    for membership in crud.list_user_memberships(
        session=session, user_id=current_user.id
    ):
        tenant = session.get(Tenant, membership.tenant_id)
        if tenant is None:
            continue
        items.append(
            TenantMembershipPublic(
                id=tenant.id,
                name=tenant.name,
                slug=tenant.slug,
                is_active=tenant.is_active,
                role=membership.role,
            )
        )
    return TenantsPublic(data=items, count=len(items))


@router.get("/tenants/current", response_model=TenantMembershipPublic)
def read_current_tenant(context: TenantContextDep) -> Any:
    return TenantMembershipPublic(
        id=context.tenant.id,
        name=context.tenant.name,
        slug=context.tenant.slug,
        is_active=context.tenant.is_active,
        role=context.role,
    )


@router.patch(
    "/tenants/current",
    response_model=TenantPublic,
    dependencies=[Depends(require_permission("tenant.manage"))],
)
def update_current_tenant(*, context: TenantContextDep, tenant_in: TenantUpdate) -> Any:
    tenant = context.tenant
    data = tenant_in.model_dump(exclude_unset=True)
    if data.get("slug") and data["slug"] != tenant.slug:
        existing = crud.get_tenant_by_slug(session=context.session, slug=data["slug"])
        if existing and existing.id != tenant.id:
            raise HTTPException(status_code=409, detail="Tenant slug already exists")
    tenant.sqlmodel_update(data)
    context.session.add(tenant)
    try:
        context.session.commit()
    except IntegrityError:
        context.session.rollback()
        raise HTTPException(status_code=409, detail="Tenant slug already exists")
    context.session.refresh(tenant)
    return tenant


@router.get(
    "/tenants",
    response_model=list[TenantPublic],
    dependencies=[Depends(get_current_active_superuser)],
)
def read_tenants(session: SessionDep) -> Any:
    return crud.get_tenants(session=session)


@router.post(
    "/tenants",
    response_model=TenantPublic,
    dependencies=[Depends(get_current_active_superuser)],
)
def create_tenant(*, session: SessionDep, tenant_in: TenantCreate) -> Any:
    if crud.get_tenant_by_slug(session=session, slug=tenant_in.slug):
        raise HTTPException(status_code=409, detail="Tenant slug already exists")
    try:
        return crud.create_tenant(session=session, tenant_in=tenant_in)
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Tenant slug already exists")

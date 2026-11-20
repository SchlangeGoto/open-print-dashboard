import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select

from app import crud
from app.api.deps import (
    CurrentUser,
    SessionDep,
    TenantContextDep,
    get_current_active_superuser,
    require_permission,
)
from app.core import security
from app.core.config import settings
from app.core.tenancy import DEFAULT_TENANT_ID, INVITABLE_ROLES, ROLES
from app.models import (
    AppSetting,
    AuditLogPublic,
    AuditLogsPublic,
    Filament,
    FilamentPublic,
    Membership,
    Message,
    PrintJob,
    PrintJobPublic,
    Spool,
    SpoolPublic,
    Tenant,
    TenantCreate,
    TenantDelete,
    TenantHealth,
    TenantHealthPrinter,
    TenantInvite,
    TenantInviteCreate,
    TenantInviteCreated,
    TenantInvitePublic,
    TenantInvitesPublic,
    TenantMemberPublic,
    TenantMembershipPublic,
    TenantMembersPublic,
    TenantMemberUpdate,
    TenantPublic,
    TenantsPublic,
    TenantUpdate,
    User,
)
from app.services.printer_service import printer_service
from app.utils import generate_invite_email, send_email

router = APIRouter(tags=["tenants"])


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _member_public(user: User, membership: Membership) -> TenantMemberPublic:
    return TenantMemberPublic(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        role=membership.role,
        created_at=membership.created_at,
    )


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
    crud.record_audit(
        session=context.session,
        tenant_id=context.tenant.id,
        user_id=context.user.id,
        action="tenant.update",
        target=tenant.slug,
    )
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


@router.delete(
    "/tenants/{tenant_id}",
    response_model=Message,
    dependencies=[Depends(get_current_active_superuser)],
)
def delete_tenant(
    *, session: SessionDep, tenant_id: uuid.UUID, body: TenantDelete
) -> Any:
    """Delete a tenant and every row that belongs to it.

    The caller must repeat the slug. The Default tenant is kept because it is
    the fallback for code that runs before a tenant is chosen and for model
    defaults.
    """
    tenant = crud.get_tenant(session=session, tenant_id=tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if tenant.id == DEFAULT_TENANT_ID:
        raise HTTPException(
            status_code=400, detail="The Default tenant cannot be deleted"
        )
    if body.slug != tenant.slug:
        raise HTTPException(status_code=400, detail="Slug does not match the tenant")
    session.delete(tenant)
    session.commit()
    return Message(message="Tenant deleted")


# ────────────────────────────────────────────────────────────
# Operations
# ────────────────────────────────────────────────────────────
@router.patch(
    "/tenants/{tenant_id}",
    response_model=TenantPublic,
    dependencies=[Depends(get_current_active_superuser)],
)
def admin_update_tenant(
    *,
    session: SessionDep,
    tenant_id: uuid.UUID,
    tenant_in: TenantUpdate,
    current_user: CurrentUser,
) -> Any:
    """Platform-admin tenant update, including deactivation."""
    tenant = crud.get_tenant(session=session, tenant_id=tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    data = tenant_in.model_dump(exclude_unset=True)
    if data.get("slug") and data["slug"] != tenant.slug:
        existing = crud.get_tenant_by_slug(session=session, slug=data["slug"])
        if existing and existing.id != tenant.id:
            raise HTTPException(status_code=409, detail="Tenant slug already exists")
    if data.get("is_active") is False and tenant.id == DEFAULT_TENANT_ID:
        raise HTTPException(
            status_code=400, detail="The Default tenant cannot be deactivated"
        )
    tenant.sqlmodel_update(data)
    session.add(tenant)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Tenant slug already exists")
    session.refresh(tenant)
    if not tenant.is_active:
        printer_service.disconnect_tenant(tenant.id)
    crud.record_audit(
        session=session,
        tenant_id=tenant.id,
        user_id=current_user.id,
        action="tenant.admin_update",
        target=tenant.slug,
        details="active" if tenant.is_active else "inactive",
    )
    return tenant


@router.get(
    "/tenants/current/health",
    response_model=TenantHealth,
)
def tenant_health(context: TenantContextDep) -> Any:
    """Report this tenant's cloud and MQTT connection state."""
    printers = crud.get_printers(session=context.session, tenant_id=context.tenant.id)
    statuses = printer_service.get_statuses(context.tenant.id)
    health_printers = [
        TenantHealthPrinter(
            serial=printer.serial,
            name=printer.name,
            connected=bool((statuses.get(printer.serial) or {}).get("connected")),
            last_report_seconds_ago=(statuses.get(printer.serial) or {}).get(
                "last_report_seconds_ago"
            ),
        )
        for printer in printers
    ]
    return TenantHealth(
        tenant_id=context.tenant.id,
        name=context.tenant.name,
        is_active=context.tenant.is_active,
        bambu_connected=crud.get_cloud_token(
            session=context.session, tenant_id=context.tenant.id
        )
        is not None,
        printers_configured=len(printers),
        printers_connected=sum(1 for item in health_printers if item.connected),
        printers=health_printers,
    )


@router.get(
    "/tenants/current/audit",
    response_model=AuditLogsPublic,
    dependencies=[Depends(require_permission("tenant.manage"))],
)
def read_audit_log(context: TenantContextDep, limit: int = 100) -> Any:
    logs = crud.list_audit_logs(
        session=context.session,
        tenant_id=context.tenant.id,
        limit=max(1, min(limit, 500)),
    )
    return AuditLogsPublic(
        data=[AuditLogPublic.model_validate(log) for log in logs],
        count=len(logs),
    )


@router.get(
    "/tenants/current/export",
    dependencies=[Depends(require_permission("tenant.manage"))],
)
def export_tenant(context: TenantContextDep) -> Any:
    """Export this tenant's data as a JSON document.

    Secrets (the Bambu token, password and email) are deliberately omitted.
    """
    session = context.session
    tenant_id = context.tenant.id
    memberships = crud.list_tenant_memberships(session=session, tenant_id=tenant_id)
    users = {
        user.id: user
        for user in session.exec(
            select(User).where(
                col(User.id).in_([membership.user_id for membership in memberships])
            )
        ).all()
    }
    settings = session.exec(
        select(AppSetting).where(AppSetting.tenant_id == tenant_id)
    ).all()
    hidden = {
        "bambu_cloud_email",
        "bambu_cloud_password",
        "bambu_cloud_token",
        "printer_access_code",
    }
    data = {
        "tenant": TenantPublic.model_validate(context.tenant).model_dump(mode="json"),
        "members": [
            _member_public(users[membership.user_id], membership).model_dump(
                mode="json"
            )
            for membership in memberships
            if membership.user_id in users
        ],
        "printers": [
            {
                "id": str(printer.id),
                "name": printer.name,
                "serial": printer.serial,
                "created_at": printer.created_at.isoformat()
                if printer.created_at
                else None,
            }
            for printer in crud.get_printers(session=session, tenant_id=tenant_id)
        ],
        "filaments": [
            FilamentPublic.model_validate(filament).model_dump(mode="json")
            for filament in session.exec(
                select(Filament).where(Filament.tenant_id == tenant_id)
            ).all()
        ],
        "spools": [
            SpoolPublic.model_validate(spool).model_dump(mode="json")
            for spool in session.exec(
                select(Spool).where(Spool.tenant_id == tenant_id)
            ).all()
        ],
        "print_jobs": [
            PrintJobPublic.model_validate(job).model_dump(mode="json")
            for job in session.exec(
                select(PrintJob).where(PrintJob.tenant_id == tenant_id)
            ).all()
        ],
        "settings": [
            {"key": setting.key, "value": setting.value}
            for setting in settings
            if setting.key not in hidden
        ],
    }
    crud.record_audit(
        session=session,
        tenant_id=tenant_id,
        user_id=context.user.id,
        action="tenant.export",
    )
    return data


# ────────────────────────────────────────────────────────────
# Members
# ────────────────────────────────────────────────────────────
@router.get(
    "/tenants/current/members",
    response_model=TenantMembersPublic,
    dependencies=[Depends(require_permission("users.read"))],
)
def read_members(context: TenantContextDep) -> Any:
    memberships = crud.list_tenant_memberships(
        session=context.session, tenant_id=context.tenant.id
    )
    user_ids = [membership.user_id for membership in memberships]
    users = (
        {
            user.id: user
            for user in context.session.exec(
                select(User).where(col(User.id).in_(user_ids))
            ).all()
        }
        if user_ids
        else {}
    )
    data = [
        _member_public(users[membership.user_id], membership)
        for membership in memberships
        if membership.user_id in users
    ]
    return TenantMembersPublic(data=data, count=len(data))


@router.patch(
    "/tenants/current/members/{user_id}",
    response_model=TenantMemberPublic,
    dependencies=[Depends(require_permission("users.write"))],
)
def update_member(
    *,
    context: TenantContextDep,
    user_id: uuid.UUID,
    member_in: TenantMemberUpdate,
) -> Any:
    if member_in.role not in ROLES:
        raise HTTPException(status_code=422, detail="Unknown role")
    membership = crud.get_membership(
        session=context.session, tenant_id=context.tenant.id, user_id=user_id
    )
    user = context.session.get(User, user_id)
    if membership is None or user is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if (
        membership.role == "owner"
        and member_in.role != "owner"
        and crud.count_tenant_owners(
            session=context.session, tenant_id=context.tenant.id
        )
        <= 1
    ):
        raise HTTPException(
            status_code=400, detail="A tenant must keep at least one owner"
        )
    membership = crud.ensure_membership(
        session=context.session,
        tenant_id=context.tenant.id,
        user_id=user_id,
        role=member_in.role,
    )
    crud.record_audit(
        session=context.session,
        tenant_id=context.tenant.id,
        user_id=context.user.id,
        action="member.role",
        target=str(user.email),
        details=member_in.role,
    )
    return _member_public(user, membership)


@router.delete(
    "/tenants/current/members/{user_id}",
    response_model=Message,
    dependencies=[Depends(require_permission("users.write"))],
)
def delete_member(*, context: TenantContextDep, user_id: uuid.UUID) -> Any:
    membership = crud.get_membership(
        session=context.session, tenant_id=context.tenant.id, user_id=user_id
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if (
        membership.role == "owner"
        and crud.count_tenant_owners(
            session=context.session, tenant_id=context.tenant.id
        )
        <= 1
    ):
        raise HTTPException(
            status_code=400, detail="A tenant must keep at least one owner"
        )
    context.session.delete(membership)
    context.session.commit()
    crud.record_audit(
        session=context.session,
        tenant_id=context.tenant.id,
        user_id=context.user.id,
        action="member.remove",
        target=str(user_id),
    )
    return Message(message="Member removed")


# ────────────────────────────────────────────────────────────
# Invites
# ────────────────────────────────────────────────────────────
@router.get(
    "/tenants/current/invites",
    response_model=TenantInvitesPublic,
    dependencies=[Depends(require_permission("users.read"))],
)
def read_invites(context: TenantContextDep) -> Any:
    invites = crud.list_pending_invites(
        session=context.session,
        tenant_id=context.tenant.id,
        now=datetime.now(UTC),
    )
    return TenantInvitesPublic(
        data=[TenantInvitePublic.model_validate(invite) for invite in invites],
        count=len(invites),
    )


@router.post(
    "/tenants/current/invites",
    response_model=TenantInviteCreated,
    dependencies=[Depends(require_permission("users.write"))],
)
def create_invite(*, context: TenantContextDep, invite_in: TenantInviteCreate) -> Any:
    if invite_in.role not in INVITABLE_ROLES:
        raise HTTPException(
            status_code=422,
            detail="Invite role must be admin, operator or viewer",
        )
    email = str(invite_in.email).lower()
    now = datetime.now(UTC)
    if settings.TENANT_MAX_USERS > 0:
        member_count = len(
            crud.list_tenant_memberships(
                session=context.session, tenant_id=context.tenant.id
            )
        )
        pending_count = len(
            crud.list_pending_invites(
                session=context.session,
                tenant_id=context.tenant.id,
                now=now,
            )
        )
        if member_count + pending_count >= settings.TENANT_MAX_USERS:
            raise HTTPException(status_code=409, detail="Tenant user quota reached")
    existing_user = crud.get_user_by_email(session=context.session, email=email)
    if existing_user and crud.get_membership(
        session=context.session,
        tenant_id=context.tenant.id,
        user_id=existing_user.id,
    ):
        raise HTTPException(status_code=400, detail="User is already a member")

    pending = context.session.exec(
        select(TenantInvite).where(
            TenantInvite.tenant_id == context.tenant.id,
            TenantInvite.email == email,
            col(TenantInvite.accepted_at).is_(None),
            col(TenantInvite.revoked_at).is_(None),
        )
    ).all()
    for invite in pending:
        if _as_utc(invite.expires_at) > now:
            raise HTTPException(
                status_code=409, detail="A pending invitation already exists"
            )
        invite.revoked_at = now
        context.session.add(invite)

    raw_token = secrets.token_urlsafe(32)
    invite = crud.create_invite(
        session=context.session,
        tenant_id=context.tenant.id,
        email=email,
        role=invite_in.role,
        token_hash=security.hash_refresh_token(raw_token),
        expires_at=now + timedelta(days=settings.TENANT_INVITE_EXPIRE_DAYS),
        invited_by=context.user.id,
    )

    accept_url = f"{settings.FRONTEND_HOST}/invite?token={raw_token}"
    delivered = False
    if settings.emails_enabled:
        try:
            email_data = generate_invite_email(
                email_to=email,
                tenant_name=context.tenant.name,
                role=invite.role,
                token=raw_token,
            )
            delivered = send_email(
                email_to=email,
                subject=email_data.subject,
                html_content=email_data.html_content,
            )
        except Exception:  # noqa: BLE001
            # The invitation exists; hand the link to the admin once instead
            # of failing the request.
            delivered = False

    crud.record_audit(
        session=context.session,
        tenant_id=context.tenant.id,
        user_id=context.user.id,
        action="invite.create",
        target=email,
        details=invite.role,
    )
    return TenantInviteCreated.model_validate(
        invite,
        update={
            "token": None if delivered else raw_token,
            "accept_url": None if delivered else accept_url,
        },
    )


@router.delete(
    "/tenants/current/invites/{invite_id}",
    response_model=Message,
    dependencies=[Depends(require_permission("users.write"))],
)
def revoke_invite(*, context: TenantContextDep, invite_id: uuid.UUID) -> Any:
    invite = context.session.exec(
        select(TenantInvite).where(
            TenantInvite.id == invite_id,
            TenantInvite.tenant_id == context.tenant.id,
        )
    ).first()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invite.accepted_at is None and invite.revoked_at is None:
        invite.revoked_at = datetime.now(UTC)
        context.session.add(invite)
        context.session.commit()
        crud.record_audit(
            session=context.session,
            tenant_id=context.tenant.id,
            user_id=context.user.id,
            action="invite.revoke",
            target=str(invite.email),
        )
    return Message(message="Invitation revoked")

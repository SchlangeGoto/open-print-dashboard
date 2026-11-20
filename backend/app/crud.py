import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlmodel import Session, col, func, select

from app.core.security import (
    decrypt_secret,
    encrypt_secret,
    get_password_hash,
    verify_password,
)
from app.core.tenancy import DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME, DEFAULT_TENANT_SLUG
from app.models import (
    AppSetting,
    Filament,
    FilamentStats,
    Membership,
    Printer,
    PrinterCreate,
    PrinterUpdate,
    PrintJobFilamentUsage,
    RefreshToken,
    Spool,
    Tenant,
    TenantCreate,
    TenantInvite,
    User,
    UserCreate,
    UserUpdate,
    get_datetime_utc,
)


# ────────────────────────────────────────────────────────────
# Tenants and memberships
# ────────────────────────────────────────────────────────────
def ensure_default_tenant(*, session: Session) -> Tenant:
    """Return the Default tenant, creating it on a database without one.

    Migrations create it for existing installs; this keeps tests and the
    setup wizard safe when they run against a cleaned database.
    """
    tenant = session.get(Tenant, DEFAULT_TENANT_ID)
    if tenant is None:
        tenant = Tenant(
            id=DEFAULT_TENANT_ID,
            name=DEFAULT_TENANT_NAME,
            slug=DEFAULT_TENANT_SLUG,
        )
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
    return tenant


def get_tenant(*, session: Session, tenant_id: uuid.UUID) -> Tenant | None:
    return session.get(Tenant, tenant_id)


def get_tenant_by_slug(*, session: Session, slug: str) -> Tenant | None:
    return session.exec(select(Tenant).where(Tenant.slug == slug)).first()


def get_tenants(*, session: Session, active_only: bool = False) -> list[Tenant]:
    statement = select(Tenant).order_by(col(Tenant.created_at), col(Tenant.id))
    if active_only:
        statement = statement.where(col(Tenant.is_active).is_(True))
    return list(session.exec(statement).all())


def create_tenant(*, session: Session, tenant_in: TenantCreate) -> Tenant:
    tenant = Tenant.model_validate(tenant_in)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


def get_membership(
    *, session: Session, tenant_id: uuid.UUID, user_id: uuid.UUID
) -> Membership | None:
    return session.exec(
        select(Membership).where(
            Membership.tenant_id == tenant_id,
            Membership.user_id == user_id,
        )
    ).first()


def list_user_memberships(*, session: Session, user_id: uuid.UUID) -> list[Membership]:
    return list(
        session.exec(
            select(Membership)
            .where(Membership.user_id == user_id)
            .order_by(col(Membership.created_at))
        ).all()
    )


def list_tenant_memberships(
    *, session: Session, tenant_id: uuid.UUID
) -> list[Membership]:
    return list(
        session.exec(
            select(Membership)
            .where(Membership.tenant_id == tenant_id)
            .order_by(col(Membership.created_at))
        ).all()
    )


def ensure_membership(
    *,
    session: Session,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str,
) -> Membership:
    membership = get_membership(session=session, tenant_id=tenant_id, user_id=user_id)
    if role == "owner":
        # The partial unique index allows one owner. Demote the previous one
        # and flush before promoting the new owner, otherwise the update of
        # the second row still sees the first owner.
        for other in session.exec(
            select(Membership).where(
                Membership.tenant_id == tenant_id,
                Membership.role == "owner",
                Membership.user_id != user_id,
            )
        ).all():
            other.role = "admin"
            session.add(other)
        session.flush()
    if membership is None:
        membership = Membership(tenant_id=tenant_id, user_id=user_id, role=role)
    else:
        membership.role = role
    session.add(membership)
    session.commit()
    session.refresh(membership)
    return membership


def count_tenant_owners(*, session: Session, tenant_id: uuid.UUID) -> int:
    return session.exec(
        select(func.count())
        .select_from(Membership)
        .where(Membership.tenant_id == tenant_id, Membership.role == "owner")
    ).one()


def get_invite_by_token_hash(
    *, session: Session, token_hash: str
) -> TenantInvite | None:
    return session.exec(
        select(TenantInvite).where(TenantInvite.token_hash == token_hash)
    ).first()


def list_pending_invites(
    *, session: Session, tenant_id: uuid.UUID, now: datetime
) -> list[TenantInvite]:
    return list(
        session.exec(
            select(TenantInvite)
            .where(
                TenantInvite.tenant_id == tenant_id,
                col(TenantInvite.accepted_at).is_(None),
                col(TenantInvite.revoked_at).is_(None),
                col(TenantInvite.expires_at) > now,
            )
            .order_by(col(TenantInvite.created_at).desc())
        ).all()
    )


def create_invite(
    *,
    session: Session,
    tenant_id: uuid.UUID,
    email: str,
    role: str,
    token_hash: str,
    expires_at: datetime,
    invited_by: uuid.UUID,
) -> TenantInvite:
    invite = TenantInvite(
        tenant_id=tenant_id,
        email=email,
        role=role,
        token_hash=token_hash,
        expires_at=expires_at,
        invited_by=invited_by,
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)
    return invite


# ────────────────────────────────────────────────────────────
# Users
# ────────────────────────────────────────────────────────────
def create_user(*, session: Session, user_create: UserCreate) -> User:
    db_obj = User.model_validate(
        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    user_data = user_in.model_dump(exclude_unset=True)
    password_changed = "password" in user_data
    deactivated = user_data.get("is_active") is False and db_user.is_active
    extra_data = {}
    if password_changed:
        password = user_data["password"]
        hashed_password = get_password_hash(password)
        extra_data["hashed_password"] = hashed_password
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    if password_changed or deactivated:
        # A password change must invalidate every existing session, including
        # when an admin resets another user's password. Deactivation must also
        # revoke now: otherwise re-activating the account resurrects every
        # refresh token that was issued before it was disabled.
        # Do it in the same transaction so a failure cannot leave the password
        # changed with live refresh tokens.
        revoke_user_refresh_tokens(session=session, user_id=db_user.id)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    session_user = session.exec(statement).first()
    return session_user


# Dummy hash to use for timing attack prevention when user is not found
# This is an Argon2 hash of a random password, used to ensure constant-time comparison
DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$MjQyZWE1MzBjYjJlZTI0Yw$YTU4NGM5ZTZmYjE2NzZlZjY0ZWY3ZGRkY2U2OWFjNjk"


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    db_user = get_user_by_email(session=session, email=email)
    if not db_user:
        # Prevent timing attacks by running password verification even when user doesn't exist
        verify_password(password, DUMMY_HASH)
        return None
    verified, updated_password_hash = verify_password(password, db_user.hashed_password)
    if not verified:
        return None
    if updated_password_hash:
        db_user.hashed_password = updated_password_hash
        session.add(db_user)
        session.commit()
        session.refresh(db_user)
    return db_user


def count_users(*, session: Session) -> int:
    return session.exec(select(func.count()).select_from(User)).one()


def revoke_user_refresh_tokens(*, session: Session, user_id: uuid.UUID) -> None:
    """Revoke every active refresh token for a user."""
    now = get_datetime_utc()
    user = session.get(User, user_id)
    if user:
        # Access tokens issued before this instant stop working too.
        user.sessions_revoked_at = now
        session.add(user)
    tokens = session.exec(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            col(RefreshToken.revoked_at).is_(None),
        )
    ).all()
    for token in tokens:
        token.revoked_at = now
        session.add(token)
    # The caller commits; revocation and the password change must be one
    # transaction.


# ────────────────────────────────────────────────────────────
# Application settings (key/value store)
# ────────────────────────────────────────────────────────────
def get_setting(
    *, session: Session, key: str, tenant_id: uuid.UUID = DEFAULT_TENANT_ID
) -> AppSetting | None:
    return session.exec(
        select(AppSetting).where(
            AppSetting.tenant_id == tenant_id, AppSetting.key == key
        )
    ).first()


def get_setting_value(
    *, session: Session, key: str, tenant_id: uuid.UUID = DEFAULT_TENANT_ID
) -> str | None:
    setting = get_setting(session=session, key=key, tenant_id=tenant_id)
    return setting.value if setting else None


def _upsert_setting(
    *, session: Session, tenant_id: uuid.UUID, key: str, value: str
) -> None:
    session.execute(
        pg_insert(AppSetting)
        .values(tenant_id=tenant_id, key=key, value=value)
        .on_conflict_do_update(
            index_elements=["tenant_id", "key"], set_={"value": value}
        )
    )


def set_setting(
    *,
    session: Session,
    key: str,
    value: str,
    tenant_id: uuid.UUID = DEFAULT_TENANT_ID,
) -> AppSetting:
    _upsert_setting(session=session, tenant_id=tenant_id, key=key, value=value)
    session.commit()
    setting = get_setting(session=session, key=key, tenant_id=tenant_id)
    if setting is None:
        raise RuntimeError(f"Setting {key} was not persisted")
    return setting


# ────────────────────────────────────────────────────────────
# Printers
# ────────────────────────────────────────────────────────────
def get_printers(
    *, session: Session, tenant_id: uuid.UUID = DEFAULT_TENANT_ID
) -> list[Printer]:
    return list(
        session.exec(
            select(Printer)
            .where(Printer.tenant_id == tenant_id)
            .order_by(col(Printer.created_at))
        ).all()
    )


def get_printer(
    *,
    session: Session,
    printer_id: uuid.UUID,
    tenant_id: uuid.UUID = DEFAULT_TENANT_ID,
) -> Printer | None:
    return session.exec(
        select(Printer).where(Printer.id == printer_id, Printer.tenant_id == tenant_id)
    ).first()


def get_printer_by_serial(
    *,
    session: Session,
    serial: str,
    tenant_id: uuid.UUID = DEFAULT_TENANT_ID,
) -> Printer | None:
    return session.exec(
        select(Printer).where(Printer.serial == serial, Printer.tenant_id == tenant_id)
    ).first()


def count_printers(
    *, session: Session, tenant_id: uuid.UUID = DEFAULT_TENANT_ID
) -> int:
    return session.exec(
        select(func.count()).select_from(Printer).where(Printer.tenant_id == tenant_id)
    ).one()


def create_printer(
    *,
    session: Session,
    printer_in: PrinterCreate,
    tenant_id: uuid.UUID = DEFAULT_TENANT_ID,
) -> Printer:
    printer = Printer.model_validate(printer_in, update={"tenant_id": tenant_id})
    session.add(printer)
    session.commit()
    session.refresh(printer)
    return printer


def update_printer(
    *, session: Session, printer: Printer, printer_in: PrinterUpdate
) -> Printer:
    printer.sqlmodel_update(printer_in.model_dump(exclude_unset=True))
    printer.updated_at = get_datetime_utc()
    session.add(printer)
    session.commit()
    session.refresh(printer)
    return printer


def delete_printer(*, session: Session, printer: Printer) -> None:
    # Unload the printer's spools in the same transaction. The FK would set
    # printer_id to null, but the spool would stay active and unreachable.
    for spool in session.exec(
        select(Spool).where(Spool.printer_id == printer.id)
    ).all():
        spool.printer_id = None
        spool.active = False
        session.add(spool)
    session.delete(printer)
    session.commit()


# ────────────────────────────────────────────────────────────
# Bambu Lab cloud credentials
# ────────────────────────────────────────────────────────────
CLOUD_SETTING_KEYS = (
    "bambu_cloud_email",
    "bambu_cloud_password",
    "bambu_cloud_token",
)


def get_cloud_token(
    *, session: Session, tenant_id: uuid.UUID = DEFAULT_TENANT_ID
) -> str | None:
    value = get_setting_value(
        session=session, key="bambu_cloud_token", tenant_id=tenant_id
    )
    if not value:
        return None
    return decrypt_secret(value)


def save_cloud_token(
    *, session: Session, token: str, tenant_id: uuid.UUID = DEFAULT_TENANT_ID
) -> None:
    set_setting(
        session=session,
        key="bambu_cloud_token",
        value=encrypt_secret(token),
        tenant_id=tenant_id,
    )


def get_cloud_credentials(
    *, session: Session, tenant_id: uuid.UUID = DEFAULT_TENANT_ID
) -> dict[str, str | None]:
    email = get_setting_value(
        session=session, key="bambu_cloud_email", tenant_id=tenant_id
    )
    password = get_setting_value(
        session=session, key="bambu_cloud_password", tenant_id=tenant_id
    )
    if not email or not password:
        return {"email": None, "password": None}
    decrypted_email = decrypt_secret(email)
    decrypted_password = decrypt_secret(password)
    if not decrypted_email or not decrypted_password:
        return {"email": None, "password": None}
    return {"email": decrypted_email, "password": decrypted_password}


def save_cloud_credentials(
    *,
    session: Session,
    email: str,
    password: str,
    tenant_id: uuid.UUID = DEFAULT_TENANT_ID,
) -> None:
    # One transaction: never store an email without its password.
    _upsert_setting(
        session=session,
        tenant_id=tenant_id,
        key="bambu_cloud_email",
        value=encrypt_secret(email),
    )
    _upsert_setting(
        session=session,
        tenant_id=tenant_id,
        key="bambu_cloud_password",
        value=encrypt_secret(password),
    )
    session.commit()


def clear_cloud_credentials(
    *, session: Session, tenant_id: uuid.UUID = DEFAULT_TENANT_ID
) -> None:
    """Forget the Bambu Cloud session and the stored account credentials."""
    settings = session.exec(
        select(AppSetting).where(
            AppSetting.tenant_id == tenant_id,
            col(AppSetting.key).in_(CLOUD_SETTING_KEYS),
        )
    ).all()
    for setting in settings:
        session.delete(setting)
    session.commit()


# ────────────────────────────────────────────────────────────
# Filament statistics
# ────────────────────────────────────────────────────────────
def get_filament_stats(*, session: Session, filament_id: uuid.UUID) -> FilamentStats:
    # An unknown weight is not stock: counting the placeholder capacity would
    # report filament that may not exist.
    known = (
        select(Spool).where(
            Spool.filament_id == filament_id,
            col(Spool.remaining_unknown).is_(False),
        )
    ).subquery()
    remaining_g = session.exec(select(func.sum(known.c.remaining_g))).first() or 0
    total_g = session.exec(select(func.sum(known.c.total_weight_g))).first() or 0
    spool_count = session.exec(
        select(func.count()).select_from(Spool).where(Spool.filament_id == filament_id)
    ).one()
    # Per-filament usage rows are indexed by filament, so stats no longer
    # scan and parse every print job. A job whose AMS mapping never resolved
    # has no row here on purpose: its stock was never reduced either, and the
    # print history still shows it.
    print_count = session.exec(
        select(func.count())
        .select_from(PrintJobFilamentUsage)
        .where(PrintJobFilamentUsage.filament_id == filament_id)
    ).one()
    total_used_g = (
        session.exec(
            select(func.sum(PrintJobFilamentUsage.weight_g)).where(
                PrintJobFilamentUsage.filament_id == filament_id
            )
        ).first()
        or 0
    )
    total_cost = (
        session.exec(
            select(func.sum(PrintJobFilamentUsage.cost)).where(
                PrintJobFilamentUsage.filament_id == filament_id
            )
        ).first()
        or 0
    )
    recent_prices = session.exec(
        select(Spool.price_per_kg)
        .where(Spool.filament_id == filament_id)
        .where(col(Spool.price_per_kg) > 0)
        .order_by(col(Spool.created_at).desc())
        .limit(5)
    ).all()
    prices = [price for price in recent_prices if price is not None and price > 0]
    avg_price = sum(prices) / len(prices) if prices else None

    return FilamentStats(
        remaining_g=remaining_g,
        total_g=total_g,
        used_percent=(
            max(0.0, round((1 - remaining_g / total_g) * 100, 1)) if total_g > 0 else 0
        ),
        spool_count=spool_count,
        print_count=print_count,
        total_used_g=total_used_g,
        total_cost=round(total_cost, 2),
        avg_price_per_kg=round(avg_price, 2) if avg_price else None,
    )


def get_filament_by_bambu_idx(
    *, session: Session, bambu_info_idx: str
) -> Filament | None:
    return session.exec(
        select(Filament).where(Filament.bambu_info_idx == bambu_info_idx)
    ).first()

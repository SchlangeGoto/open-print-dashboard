import uuid
from typing import Any

from sqlmodel import Session, col, func, select

from app.core.security import (
    decrypt_secret,
    encrypt_secret,
    get_password_hash,
    verify_password,
)
from app.models import (
    AppSetting,
    Filament,
    FilamentStats,
    PrintJob,
    Spool,
    User,
    UserCreate,
    UserUpdate,
)


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
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = get_password_hash(password)
        extra_data["hashed_password"] = hashed_password
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
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


# ────────────────────────────────────────────────────────────
# Application settings (key/value store)
# ────────────────────────────────────────────────────────────
def get_setting(*, session: Session, key: str) -> AppSetting | None:
    return session.get(AppSetting, key)


def get_setting_value(*, session: Session, key: str) -> str | None:
    setting = session.get(AppSetting, key)
    return setting.value if setting else None


def set_setting(*, session: Session, key: str, value: str) -> AppSetting:
    setting = session.get(AppSetting, key)
    if setting:
        setting.value = value
    else:
        setting = AppSetting(key=key, value=value)
        session.add(setting)
    session.commit()
    session.refresh(setting)
    return setting


def get_printer_config(*, session: Session) -> dict[str, str | None]:
    return {
        "ip": get_setting_value(session=session, key="printer_ip"),
        "serial": get_setting_value(session=session, key="printer_serial"),
        "access_code": get_setting_value(session=session, key="printer_access_code"),
    }


def save_printer_config(
    *, session: Session, ip: str, serial: str, access_code: str
) -> None:
    set_setting(session=session, key="printer_ip", value=ip)
    set_setting(session=session, key="printer_serial", value=serial)
    set_setting(session=session, key="printer_access_code", value=access_code)


# ────────────────────────────────────────────────────────────
# Bambu Lab cloud credentials
# ────────────────────────────────────────────────────────────
def get_cloud_token(*, session: Session) -> str | None:
    value = get_setting_value(session=session, key="bambu_cloud_token")
    return decrypt_secret(value) if value else None


def save_cloud_token(*, session: Session, token: str) -> None:
    set_setting(session=session, key="bambu_cloud_token", value=encrypt_secret(token))


def get_cloud_credentials(*, session: Session) -> dict[str, str | None]:
    email = get_setting_value(session=session, key="bambu_cloud_email")
    password = get_setting_value(session=session, key="bambu_cloud_password")
    if not email or not password:
        return {"email": None, "password": None}
    return {"email": decrypt_secret(email), "password": decrypt_secret(password)}


def save_cloud_credentials(*, session: Session, email: str, password: str) -> None:
    set_setting(session=session, key="bambu_cloud_email", value=encrypt_secret(email))
    set_setting(
        session=session, key="bambu_cloud_password", value=encrypt_secret(password)
    )


# ────────────────────────────────────────────────────────────
# Filament statistics
# ────────────────────────────────────────────────────────────
def get_filament_stats(*, session: Session, filament_id: uuid.UUID) -> FilamentStats:
    remaining_g = (
        session.exec(
            select(func.sum(Spool.remaining_g)).where(Spool.filament_id == filament_id)
        ).first()
        or 0
    )
    total_g = (
        session.exec(
            select(func.sum(Spool.total_weight_g)).where(
                Spool.filament_id == filament_id
            )
        ).first()
        or 0
    )
    spool_count = session.exec(
        select(func.count()).select_from(Spool).where(Spool.filament_id == filament_id)
    ).one()
    print_count = session.exec(
        select(func.count())
        .select_from(PrintJob)
        .join(Spool, col(PrintJob.spool_id) == col(Spool.id))
        .where(Spool.filament_id == filament_id)
    ).one()
    total_used_g = (
        session.exec(
            select(func.sum(PrintJob.weight))
            .join(Spool, col(PrintJob.spool_id) == col(Spool.id))
            .where(Spool.filament_id == filament_id)
            .where(col(PrintJob.weight).is_not(None))
        ).first()
        or 0
    )
    total_cost = (
        session.exec(
            select(func.sum(PrintJob.estimated_cost))
            .join(Spool, col(PrintJob.spool_id) == col(Spool.id))
            .where(Spool.filament_id == filament_id)
            .where(col(PrintJob.estimated_cost).is_not(None))
        ).first()
        or 0
    )
    avg_price = session.exec(
        select(func.avg(Spool.price_per_kg))
        .where(Spool.filament_id == filament_id)
        .where(col(Spool.price_per_kg).is_not(None))
    ).first()

    return FilamentStats(
        remaining_g=remaining_g,
        total_g=total_g,
        used_percent=round((1 - remaining_g / total_g) * 100, 1) if total_g > 0 else 0,
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

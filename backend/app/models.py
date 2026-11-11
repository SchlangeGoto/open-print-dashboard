import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import EmailStr, field_validator, model_validator
from sqlalchemy import Index, UniqueConstraint, text
from sqlmodel import Field, Relationship, SQLModel

from app.core.barcodes import is_valid_ean13, normalize_barcode


def get_datetime_utc() -> datetime:
    return datetime.now(UTC)


# Formats whose payload is a GTIN. Code128, Code39, Code93 and Codabar are
# free-form and must not be padded or check-digit validated as EAN-13.
NUMERIC_BARCODE_TYPES = {"ean13", "ean8", "upc_a", "upc_e", "itf14", "gtin"}


def _normalize_barcode_field(value: str) -> str:
    normalized = normalize_barcode(value)
    if (
        len(normalized) == 13
        and normalized.isdigit()
        and not is_valid_ean13(normalized)
    ):
        raise ValueError("Invalid EAN-13 check digit")
    return normalized


def _normalize_barcode_for_type(value: str, barcode_type: str | None) -> str:
    if barcode_type and barcode_type.lower() not in NUMERIC_BARCODE_TYPES:
        return value.strip()
    return _normalize_barcode_field(value)


# ────────────────────────────────────────────────────────────
# Users
# ────────────────────────────────────────────────────────────
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class UserUpdate(SQLModel):
    email: EmailStr | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    is_superuser: bool | None = None
    full_name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    # Access tokens issued before this instant are rejected. Set on password
    # change and reuse detection, not on a single-device logout.
    sessions_revoked_at: datetime | None = None
    # The id of the newest password-reset token. A reset burns it, so an old
    # link cannot be reused after the password changed.
    password_reset_jti: str | None = Field(default=None, max_length=64)


class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


class RefreshToken(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    token_hash: str = Field(unique=True, index=True, max_length=64)
    expires_at: datetime
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    revoked_at: datetime | None = None


# ────────────────────────────────────────────────────────────
# Filaments
# ────────────────────────────────────────────────────────────
class FilamentBase(SQLModel):
    brand: str = Field(min_length=1, max_length=100)
    material: str = Field(min_length=1, max_length=50)
    # Catalog series ("Support W", "PLA Matte", ...). Distinguishes products
    # that share brand/material/colour, such as the white Support SKUs.
    series: str | None = Field(default=None, max_length=50)
    color_name: str = Field(min_length=1, max_length=100)
    color_hex: str = Field(min_length=4, max_length=9)
    nozzle_temp_min: int | None = None
    nozzle_temp_max: int | None = None
    bed_temp: int | None = None
    bambu_info_idx: str | None = Field(default=None, max_length=50)
    spool_weight_g: float = Field(default=1000, gt=0)
    notes: str | None = Field(default=None, max_length=1000)


class FilamentCreate(FilamentBase):
    pass


class FilamentUpdate(SQLModel):
    brand: str | None = Field(default=None, min_length=1, max_length=100)
    material: str | None = Field(default=None, min_length=1, max_length=50)
    series: str | None = Field(default=None, max_length=50)
    color_name: str | None = Field(default=None, min_length=1, max_length=100)
    color_hex: str | None = Field(default=None, min_length=4, max_length=9)
    nozzle_temp_min: int | None = None
    nozzle_temp_max: int | None = None
    bed_temp: int | None = None
    bambu_info_idx: str | None = Field(default=None, max_length=50)
    spool_weight_g: float | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _reject_null_non_nullable_fields(self) -> "FilamentUpdate":
        for field in (
            "brand",
            "material",
            "color_name",
            "color_hex",
            "spool_weight_g",
        ):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class Filament(FilamentBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    spools: list["Spool"] = Relationship(back_populates="filament", cascade_delete=True)


class FilamentPublic(FilamentBase):
    id: uuid.UUID
    created_at: datetime | None = None


class FilamentPublicWithStats(FilamentPublic):
    total_remaining_g: float = 0
    avg_price_per_kg: float | None = None


class FilamentsPublic(SQLModel):
    data: list[FilamentPublicWithStats]
    count: int


class FilamentStats(SQLModel):
    remaining_g: float
    total_g: float
    used_percent: float
    spool_count: int
    print_count: int
    total_used_g: float
    total_cost: float
    avg_price_per_kg: float | None = None


class FilamentBarcode(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(unique=True, index=True, max_length=100)
    filament_id: uuid.UUID = Field(
        foreign_key="filament.id", ondelete="CASCADE", index=True
    )
    created_at: datetime | None = Field(default_factory=get_datetime_utc)


# ────────────────────────────────────────────────────────────
# Spools
# ────────────────────────────────────────────────────────────
class SpoolBase(SQLModel):
    total_weight_g: float = Field(gt=0)
    remaining_g: float = Field(ge=0)
    # The AMS found the spool but could not report how much filament is left.
    # remaining_g then holds the nominal capacity and must not be shown as a
    # real measurement or used for deduction.
    remaining_unknown: bool = False
    tag_uid: str | None = Field(default=None, max_length=100, index=True, unique=True)
    barcode: str | None = Field(default=None, max_length=100, index=True)
    source: str | None = Field(default=None, max_length=20)
    active: bool = False
    price_per_kg: float | None = Field(default=None, ge=0)
    purchased_at: datetime | None = None
    last_used_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)


class SpoolCreate(SpoolBase):
    filament_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _remaining_within_total(self) -> "SpoolCreate":
        if self.remaining_g > self.total_weight_g:
            raise ValueError("remaining_g cannot exceed total_weight_g")
        return self


class SpoolUpdate(SQLModel):
    filament_id: uuid.UUID | None = None
    total_weight_g: float | None = Field(default=None, gt=0)
    remaining_g: float | None = Field(default=None, ge=0)
    remaining_unknown: bool | None = None
    tag_uid: str | None = Field(default=None, max_length=100)
    barcode: str | None = Field(default=None, max_length=100)
    source: str | None = Field(default=None, max_length=20)
    active: bool | None = None
    price_per_kg: float | None = Field(default=None, ge=0)
    purchased_at: datetime | None = None
    last_used_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _reject_null_non_nullable_fields(self) -> "SpoolUpdate":
        for field in (
            "total_weight_g",
            "remaining_g",
            "active",
            "remaining_unknown",
        ):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class Spool(SpoolBase, table=True):
    # Client idempotency key for scan/confirm retries. Internal, not public.
    request_id: str | None = Field(default=None, max_length=64)
    # Constraint that the AMS sync relies on: at most one active spool per
    # printer. Keep it declared on the model so autogenerate cannot drop it.
    __table_args__ = (
        Index(
            "uq_spool_active_printer",
            "printer_id",
            unique=True,
            postgresql_where=text("active"),
        ),
        Index("uq_spool_request_id", "request_id", unique=True),
        Index("ix_spool_filament_created", "filament_id", "created_at"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    filament_id: uuid.UUID | None = Field(
        default=None, foreign_key="filament.id", ondelete="CASCADE"
    )
    printer_id: uuid.UUID | None = Field(
        default=None, foreign_key="printer.id", ondelete="SET NULL", index=True
    )
    filament: Filament | None = Relationship(back_populates="spools")
    # Print history outlives the spool. The foreign key is ``SET NULL``, so the
    # database clears the reference instead of the ORM deleting the jobs.
    print_jobs: list["PrintJob"] = Relationship(back_populates="spool")


class SpoolPublic(SpoolBase):
    id: uuid.UUID
    filament_id: uuid.UUID | None = None
    printer_id: uuid.UUID | None = None
    created_at: datetime | None = None


class SpoolsPublic(SQLModel):
    data: list[SpoolPublic]
    count: int


class SpoolActivateRequest(SQLModel):
    printer_id: uuid.UUID


class BarcodeScanRequest(SQLModel):
    code: str = Field(min_length=1, max_length=100)
    request_id: str | None = Field(default=None, max_length=64)

    @field_validator("request_id")
    @classmethod
    def _normalize_request_id(cls, value: str | None) -> str | None:
        return (value or "").strip() or None

    # Optional printed SKU, used to prefill the create-filament form.
    sku: str | None = Field(default=None, max_length=100)
    # Existing clients omit this and keep the old create-on-scan behavior.
    # The mobile app first sends create=false to check for a duplicate.
    create: bool = True
    # Scanner symbology (ean13, code128, ...). Only GTIN formats are padded
    # and check-digit validated; omitted keeps the old behaviour for manual
    # entry.
    type: str | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def _normalize_code(self) -> "BarcodeScanRequest":
        self.code = _normalize_barcode_for_type(self.code, self.type)
        if not self.code:
            raise ValueError("code cannot be empty")
        return self


class BarcodeConfirmRequest(SQLModel):
    code: str = Field(min_length=1, max_length=100)
    request_id: str | None = Field(default=None, max_length=64)

    @field_validator("request_id")
    @classmethod
    def _normalize_request_id(cls, value: str | None) -> str | None:
        return (value or "").strip() or None

    filament: FilamentCreate
    total_weight_g: float | None = Field(default=None, gt=0)
    price_per_kg: float | None = Field(default=None, ge=0)
    type: str | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def _normalize_code(self) -> "BarcodeConfirmRequest":
        self.code = _normalize_barcode_for_type(self.code, self.type)
        if not self.code:
            raise ValueError("code cannot be empty")
        return self


class BarcodeScanResult(SQLModel):
    found: bool
    code: str
    filament: FilamentPublic | None = None
    spool: SpoolPublic | None = None
    created: bool = False
    existing_spools: list[SpoolPublic] = []
    suggested_filament: dict[str, Any] | None = None


# ────────────────────────────────────────────────────────────
# Print jobs
# ────────────────────────────────────────────────────────────
class PrintJobBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    cover: str | None = None
    weight: float | None = None
    estimated_cost: float | None = None
    duration_seconds: int | None = None
    start_time: datetime | None = None
    finished_at: datetime | None = None
    status: int | None = None
    bambu_task_id: str | None = Field(default=None, max_length=100)
    device_id: str | None = Field(default=None, max_length=100)
    ams_detail_mapping: str | None = None


class PrintJob(PrintJobBase, table=True):
    # One cloud task maps to one row per printer. This is what makes the
    # filament deduction claim atomic across overlapping finish/init threads.
    __table_args__ = (
        UniqueConstraint("device_id", "bambu_task_id", name="uq_printjob_device_task"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    # Set when filament was subtracted for this job, so a repeated finish
    # event cannot deduct the same print twice.
    filament_deducted_at: datetime | None = None
    # A finish that cannot resolve its AMS mapping yet is retried. These
    # fields survive a restart so /prints/active cannot stay stuck forever.
    finish_requested_at: datetime | None = None
    finish_attempts: int = 0
    finish_state: str | None = Field(default=None, max_length=10)
    # JSON map of "ams:slot" -> spool UUID resolved at finish. A delayed
    # retry must charge those rolls, not whatever is loaded later.
    deduction_spools: str | None = None
    # JSON map of filament UUID -> {"weight": g, "cost": €} for multi-colour
    # prints, so filament statistics do not credit the whole job to one row.
    filament_usage: str | None = None
    # Denormalised so filament statistics survive deleting the spool.
    filament_id: uuid.UUID | None = Field(
        default=None, foreign_key="filament.id", ondelete="SET NULL", index=True
    )
    spool_id: uuid.UUID | None = Field(
        default=None, foreign_key="spool.id", ondelete="SET NULL"
    )
    spool: Spool | None = Relationship(back_populates="print_jobs")


class PrintJobPublic(PrintJobBase):
    id: uuid.UUID
    spool_id: uuid.UUID | None = None
    # Survives deleting the spool, unlike the spool_id join.
    filament_id: uuid.UUID | None = None
    created_at: datetime | None = None


class PrintJobsPublic(SQLModel):
    data: list[PrintJobPublic]
    count: int


class PrintJobFilamentUsage(SQLModel, table=True):
    __tablename__ = "printjob_filament_usage"
    __table_args__ = (
        UniqueConstraint(
            "print_job_id",
            "filament_id",
            name="uq_printjob_filament_usage",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    print_job_id: uuid.UUID = Field(
        foreign_key="printjob.id", ondelete="CASCADE", index=True
    )
    filament_id: uuid.UUID | None = Field(
        default=None, foreign_key="filament.id", ondelete="SET NULL", index=True
    )
    weight_g: float = 0
    cost: float | None = None


# ────────────────────────────────────────────────────────────
# Application settings (key/value store)
# ────────────────────────────────────────────────────────────
class AppSetting(SQLModel, table=True):
    key: str = Field(primary_key=True, max_length=100)
    value: str


class SettingPublic(SQLModel):
    key: str
    value: str


class SettingUpdate(SQLModel):
    key: str = Field(max_length=100)
    value: str


# ────────────────────────────────────────────────────────────
# Printers
# ────────────────────────────────────────────────────────────
class PrinterBase(SQLModel):
    name: str = Field(min_length=1, max_length=100)
    serial: str = Field(min_length=1, max_length=100)


class PrinterCreate(PrinterBase):
    pass


class PrinterUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def _reject_null_name(self) -> "PrinterUpdate":
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self


class Printer(PrinterBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    serial: str = Field(unique=True, index=True, max_length=100)
    # Deprecated LAN columns, kept for one release. Local MQTT is retired and
    # every printer connects through Bambu Cloud. A follow-up migration drops
    # these; nothing reads or writes them anymore.
    ip: str | None = Field(default=None, max_length=100)
    access_code: str | None = Field(default=None, max_length=100)
    connection_mode: str = Field(default="cloud", max_length=20)
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    updated_at: datetime | None = Field(default_factory=get_datetime_utc)


class PrinterPublic(SQLModel):
    id: uuid.UUID | None = None
    name: str
    serial: str
    model: str | None = None
    online: bool = False
    configured: bool = False
    status: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ────────────────────────────────────────────────────────────
# Helper payloads
# ────────────────────────────────────────────────────────────
class SetupStatus(SQLModel):
    # Public: enough for the login/setup routing decision.
    user_created: bool
    setup_complete: bool


class SetupProgress(SetupStatus):
    # Authenticated: the detailed step state.
    bambu_logged_in: bool
    printer_configured: bool


class Message(SQLModel):
    message: str


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class Token(SQLModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None


class RefreshTokenRequest(SQLModel):
    refresh_token: str = Field(min_length=1, max_length=512)


class TokenPayload(SQLModel):
    sub: str | None = None
    iat: float | None = None

import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import EmailStr, field_validator, model_validator
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(UTC)


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
    color_name: str | None = Field(default=None, min_length=1, max_length=100)
    color_hex: str | None = Field(default=None, min_length=4, max_length=9)
    nozzle_temp_min: int | None = None
    nozzle_temp_max: int | None = None
    bed_temp: int | None = None
    bambu_info_idx: str | None = Field(default=None, max_length=50)
    spool_weight_g: float | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=1000)


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
    filament_id: uuid.UUID = Field(foreign_key="filament.id", ondelete="CASCADE")
    created_at: datetime | None = Field(default_factory=get_datetime_utc)


# ────────────────────────────────────────────────────────────
# Spools
# ────────────────────────────────────────────────────────────
class SpoolBase(SQLModel):
    total_weight_g: float = Field(gt=0)
    remaining_g: float = Field(ge=0)
    nfc_uid: str | None = Field(default=None, max_length=100)
    tag_uid: str | None = Field(default=None, max_length=100, index=True)
    barcode: str | None = Field(default=None, max_length=100, index=True)
    source: str | None = Field(default=None, max_length=20)
    active: bool = False
    price_per_kg: float | None = Field(default=None, ge=0)
    purchased_at: datetime | None = None
    last_used_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)


class SpoolCreate(SpoolBase):
    filament_id: uuid.UUID | None = None


class SpoolUpdate(SQLModel):
    filament_id: uuid.UUID | None = None
    total_weight_g: float | None = Field(default=None, gt=0)
    remaining_g: float | None = Field(default=None, ge=0)
    nfc_uid: str | None = Field(default=None, max_length=100)
    tag_uid: str | None = Field(default=None, max_length=100)
    barcode: str | None = Field(default=None, max_length=100)
    source: str | None = Field(default=None, max_length=20)
    active: bool | None = None
    price_per_kg: float | None = Field(default=None, ge=0)
    purchased_at: datetime | None = None
    last_used_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)


class Spool(SpoolBase, table=True):
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


class SpoolScanRequest(SQLModel):
    uid: str


class SpoolAssignRequest(SQLModel):
    uid: str
    spool_id: uuid.UUID


class SpoolActivateRequest(SQLModel):
    printer_id: uuid.UUID


class SpoolScanResult(SQLModel):
    found: bool
    uid: str
    spool: SpoolPublic | None = None
    unassigned_spools: list[SpoolPublic] = []


class BarcodeScanRequest(SQLModel):
    code: str = Field(min_length=1, max_length=100)
    # Existing clients omit this and keep the old create-on-scan behavior.
    # The mobile app first sends create=false to check for a duplicate.
    create: bool = True


class BarcodeConfirmRequest(SQLModel):
    code: str = Field(min_length=1, max_length=100)
    filament: FilamentCreate
    total_weight_g: float | None = Field(default=None, gt=0)
    price_per_kg: float | None = Field(default=None, ge=0)


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
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    spool_id: uuid.UUID | None = Field(
        default=None, foreign_key="spool.id", ondelete="SET NULL"
    )
    spool: Spool | None = Relationship(back_populates="print_jobs")


class PrintJobPublic(PrintJobBase):
    id: uuid.UUID
    spool_id: uuid.UUID | None = None
    created_at: datetime | None = None


class PrintJobsPublic(SQLModel):
    data: list[PrintJobPublic]
    count: int


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


class PrinterConfig(SQLModel):
    ip: str | None = None
    serial: str | None = None
    access_code: str | None = None


# ────────────────────────────────────────────────────────────
# Printers
# ────────────────────────────────────────────────────────────
CONNECTION_MODES = ("cloud", "lan")


class PrinterBase(SQLModel):
    name: str = Field(min_length=1, max_length=100)
    serial: str = Field(min_length=1, max_length=100)
    # LAN fields are only required when connection_mode is "lan". Cloud
    # printers are reached through the authenticated Bambu Cloud MQTT broker.
    ip: str | None = Field(default=None, max_length=100)
    access_code: str | None = Field(default=None, max_length=100)
    connection_mode: str = Field(default="cloud", max_length=20)

    @field_validator("connection_mode")
    @classmethod
    def _validate_connection_mode(cls, value: str) -> str:
        if value not in CONNECTION_MODES:
            raise ValueError(
                f"connection_mode must be one of: {', '.join(CONNECTION_MODES)}"
            )
        return value


class PrinterCreate(PrinterBase):
    @model_validator(mode="after")
    def _validate_lan_credentials(self) -> "PrinterCreate":
        if self.connection_mode == "lan" and not (self.ip and self.access_code):
            raise ValueError("LAN printers require an IP address and access code")
        return self


class PrinterUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    ip: str | None = Field(default=None, max_length=100)
    access_code: str | None = Field(default=None, max_length=100)
    connection_mode: str | None = Field(default=None, max_length=20)

    @field_validator("connection_mode")
    @classmethod
    def _validate_connection_mode(cls, value: str | None) -> str | None:
        if value is not None and value not in CONNECTION_MODES:
            raise ValueError(
                f"connection_mode must be one of: {', '.join(CONNECTION_MODES)}"
            )
        return value


class Printer(PrinterBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    serial: str = Field(unique=True, index=True, max_length=100)
    created_at: datetime | None = Field(default_factory=get_datetime_utc)
    updated_at: datetime | None = Field(default_factory=get_datetime_utc)


class PrinterPublic(SQLModel):
    id: uuid.UUID | None = None
    name: str
    serial: str
    model: str | None = None
    ip: str | None = None
    access_code: str | None = None
    connection_mode: str = "cloud"
    online: bool = False
    configured: bool = False
    status: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ────────────────────────────────────────────────────────────
# Helper payloads
# ────────────────────────────────────────────────────────────
class SetupStatus(SQLModel):
    user_created: bool
    bambu_logged_in: bool
    printer_configured: bool
    setup_complete: bool


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

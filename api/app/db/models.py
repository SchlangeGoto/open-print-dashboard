from datetime import datetime, timezone
from sqlmodel import SQLModel, Field
from typing import Optional

class Filament(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    brand: str
    material: str
    color_name: str
    color_hex: str
    nozzle_temp_min: Optional[int] = None
    nozzle_temp_max: Optional[int] = None
    bed_temp: Optional[int] = None
    bambu_info_idx: Optional[str] = None
    notes: Optional[str] = None

class Spool(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filament_id: Optional[int] = Field(default=None, foreign_key="filament.id")
    total_weight_g: float
    remaining_g: float
    nfc_uid: Optional[str] = None
    active: bool = False
    price_per_kg: Optional[float] = None
    purchased_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_used_at: Optional[datetime] = None
    notes: Optional[str] = None

class PrintJob(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    spool_id: Optional[int] = Field(default=None, foreign_key="spool.id")
    title: str
    cover: Optional[str] = None
    weight: Optional[float] = None
    estimated_cost: Optional[float] = None
    duration_seconds: Optional[int] = None
    start_time: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[int] = None
    bambu_task_id: Optional[str] = None
    device_id: str
    ams_detail_mapping: Optional[str] = None  # JSON string

class Settings(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str
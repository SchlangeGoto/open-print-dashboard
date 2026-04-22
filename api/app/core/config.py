import os
from dataclasses import dataclass


@dataclass
class Config:
    printer_ip: str = os.getenv("PRINTER_IP", "127.0.0.1")
    printer_serial: str = os.getenv("PRINTER_SERIAL", "")
    printer_access_code: str = os.getenv("PRINTER_ACCESS_CODE", "")
    database_url: str = os.getenv("DATABASE_URL", "")

config = Config()

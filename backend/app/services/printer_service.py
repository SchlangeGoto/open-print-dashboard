import logging

from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.core.db import engine
from app.core.store import get_cloud_token, save_cloud_credentials, save_cloud_token
from app.models import Printer, PrinterCreate
from app.services.bambu_client import BambuClient
from app.services.bambu_cloud import BambuCloudClient

logger = logging.getLogger("uvicorn.error")


class PrinterService:
    def __init__(self, cloud_client: BambuCloudClient) -> None:
        self.clients: dict[str, BambuClient] = {}
        self.cloud_client = cloud_client

    def get_token(self) -> str | None:
        return self.cloud_client.token

    def login(self, code: str | None = None) -> None:
        self.cloud_client.login(code)
        self.save_token()
        self.save_credentials()
        # A fresh token is needed by the cloud MQTT clients, so reconnect
        # anything that was configured before the login.
        self.reload()

    def save_token(self) -> None:
        if self.cloud_client.token:
            save_cloud_token(self.cloud_client.token)

    def save_credentials(self) -> None:
        if self.cloud_client.email and self.cloud_client.password:
            save_cloud_credentials(self.cloud_client.email, self.cloud_client.password)

    def _connect(self, printer: Printer) -> None:
        client = BambuClient()

        if printer.connection_mode == "cloud":
            token = self.cloud_client.token or get_cloud_token()
            if not token:
                logger.info(
                    "Printer %s uses Bambu Cloud but no account is connected",
                    printer.serial,
                )
                return
            self.cloud_client.token = token
            try:
                user_id = self.cloud_client.get_user_id()
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Could not resolve the Bambu Cloud user id for %s: %s",
                    printer.serial,
                    exc,
                )
                return
            client.configure(
                settings.BAMBU_CLOUD_MQTT_HOST,
                printer.serial,
                mode="cloud",
                username=f"u_{user_id}",
                password=token,
                port=settings.BAMBU_CLOUD_MQTT_PORT,
            )
        else:
            client.configure(
                printer.ip,
                printer.serial,
                printer.access_code,
                mode="lan",
            )

        if not client.is_configured:
            logger.info("Printer %s is not configured — MQTT skipped", printer.serial)
            return
        self.clients[printer.serial] = client
        client.connect()

    def configure_and_connect(self) -> None:
        """Load all configured printers and start one MQTT client per printer."""
        with Session(engine) as session:
            printers = crud.get_printers(session=session)
            if (
                not printers
                and settings.PRINTER_IP
                and settings.PRINTER_SERIAL
                and settings.PRINTER_ACCESS_CODE
            ):
                printer = crud.create_printer(
                    session=session,
                    printer_in=PrinterCreate(
                        name=settings.PRINTER_SERIAL,
                        serial=settings.PRINTER_SERIAL,
                        ip=settings.PRINTER_IP,
                        access_code=settings.PRINTER_ACCESS_CODE,
                        connection_mode="lan",
                    ),
                )
                printers = [printer]

        for printer in printers:
            if printer.serial in self.clients:
                continue
            self._connect(printer)

    def disconnect(self) -> None:
        for client in self.clients.values():
            client.disconnect()
        self.clients.clear()

    def disconnect_cloud(self) -> None:
        """Disconnect only the cloud clients, leaving LAN printers running."""
        for serial, client in list(self.clients.items()):
            if client.mode == "cloud":
                client.disconnect()
                del self.clients[serial]

    def reload(self) -> None:
        self.disconnect()
        self.configure_and_connect()

    def reload_printer(self, serial: str) -> None:
        client = self.clients.pop(serial, None)
        if client:
            client.disconnect()

        with Session(engine) as session:
            printer = crud.get_printer_by_serial(session=session, serial=serial)
        if printer:
            self._connect(printer)

    def get_client(self, serial: str) -> BambuClient | None:
        return self.clients.get(serial)

    def get_status(self, serial: str) -> dict:
        client = self.get_client(serial)
        if client is None:
            return {"connected": False, "status": "no_data"}
        return client.get_status()

    def get_statuses(self) -> dict[str, dict]:
        return {serial: client.get_status() for serial, client in self.clients.items()}


printer_service = PrinterService(BambuCloudClient())

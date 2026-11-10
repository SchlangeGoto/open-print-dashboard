import logging
import threading

from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.core.db import engine
from app.core.store import get_cloud_token, save_cloud_credentials, save_cloud_token
from app.models import Printer
from app.services.bambu_client import BambuClient
from app.services.bambu_cloud import BambuCloudClient

logger = logging.getLogger("uvicorn.error")


class PrinterService:
    def __init__(self, cloud_client: BambuCloudClient) -> None:
        self.clients: dict[str, BambuClient] = {}
        self.cloud_client = cloud_client
        # ``clients`` is touched from request threads and the MQTT threads.
        # Only the dict operations are guarded; connecting happens outside the
        # lock because it can block on the network.
        self._lock = threading.Lock()
        self._reconnect_timers: dict[str, threading.Timer] = {}

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
        with self._lock:
            if printer.serial in self.clients:
                return

        client = BambuClient()

        token = self.cloud_client.token or get_cloud_token()
        if not token:
            logger.info(
                "Printer %s needs a Bambu Cloud account, but none is connected",
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
            self._schedule_reconnect(printer.serial)
            return
        client.configure(
            settings.BAMBU_CLOUD_MQTT_HOST,
            printer.serial,
            username=f"u_{user_id}",
            password=token,
            port=settings.BAMBU_CLOUD_MQTT_PORT,
        )

        if not client.is_configured:
            logger.info("Printer %s is not configured — MQTT skipped", printer.serial)
            return

        # Another thread may have connected this printer while the user id was
        # being resolved. Only the winner is registered and started.
        with self._lock:
            if printer.serial in self.clients:
                return
            self.clients[printer.serial] = client
        try:
            client.connect()
        except Exception:
            with self._lock:
                self.clients.pop(printer.serial, None)
            raise

    def configure_and_connect(self) -> None:
        """Load all configured printers and start one MQTT client per printer."""
        with Session(engine) as session:
            printers = crud.get_printers(session=session)

        for printer in printers:
            self._connect(printer)

    def disconnect(self) -> None:
        with self._lock:
            clients = list(self.clients.values())
            self.clients.clear()
            timers = list(self._reconnect_timers.values())
            self._reconnect_timers.clear()
        for timer in timers:
            timer.cancel()
        for client in clients:
            client.disconnect()

    def _schedule_reconnect(self, serial: str, delay: float = 60.0) -> None:
        """Retry a cloud connection that failed transiently."""
        with self._lock:
            if serial in self._reconnect_timers:
                return

            def run() -> None:
                with self._lock:
                    self._reconnect_timers.pop(serial, None)
                self.reload_printer(serial)

            timer = threading.Timer(delay, run)
            timer.daemon = True
            self._reconnect_timers[serial] = timer
        timer.start()

    def reload(self) -> None:
        self.disconnect()
        self.configure_and_connect()

    def reload_printer(self, serial: str) -> None:
        with self._lock:
            client = self.clients.pop(serial, None)
        if client:
            client.disconnect()

        with Session(engine) as session:
            printer = crud.get_printer_by_serial(session=session, serial=serial)
        if printer:
            self._connect(printer)

    def get_client(self, serial: str) -> BambuClient | None:
        with self._lock:
            return self.clients.get(serial)

    def get_status(self, serial: str) -> dict:
        client = self.get_client(serial)
        if client is None:
            return {"connected": False, "status": "no_data"}
        return client.get_status()

    def get_statuses(self) -> dict[str, dict]:
        with self._lock:
            clients = list(self.clients.items())
        return {serial: client.get_status() for serial, client in clients}


printer_service = PrinterService(BambuCloudClient())

import logging
import threading
import time

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
        # Only one automatic re-login may run at a time. A token that Bambu
        # rejects right after a successful login means the account needs a
        # human, so do not loop on the login endpoint.
        self._reauth_condition = threading.Condition()
        self._reauthing = False
        self._last_reauth_ok = False
        self._last_reauth_at: float | None = None
        self._reauth_cooldown = 60.0
        # Serialize connects per printer and cancel a connect that loses a
        # race with disconnect()/reload_printer().
        self._connecting: set[str] = set()
        self._connect_epochs: dict[str, int] = {}

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

    def reauthenticate(self) -> bool:
        """Log in again with the persisted Bambu Cloud credentials.

        Called by an MQTT client whose token was rejected. Concurrent callers
        share one login attempt instead of sending duplicate requests. A
        second attempt within the cooldown returns False so a token that Bambu
        keeps rejecting surfaces as "re-login required" instead of looping.
        """
        with self._reauth_condition:
            if self._reauthing:
                self._reauth_condition.wait_for(lambda: not self._reauthing, timeout=60)
                return self._last_reauth_ok
            if (
                self._last_reauth_at is not None
                and time.monotonic() - self._last_reauth_at < self._reauth_cooldown
            ):
                return False
            self._reauthing = True

        ok = False
        try:
            self.login()
            ok = True
        except Exception as exc:  # noqa: BLE001
            logger.error("Bambu Cloud re-login failed: %s", exc)
        finally:
            with self._reauth_condition:
                self._reauthing = False
                self._last_reauth_ok = ok
                self._last_reauth_at = time.monotonic()
                self._reauth_condition.notify_all()
        return ok

    def _connect(self, printer: Printer) -> None:
        serial = printer.serial
        with self._lock:
            if serial in self.clients or serial in self._connecting:
                return
            self._connecting.add(serial)
            epoch = self._connect_epochs.get(serial, 0)
        try:
            client = BambuClient()

            token = self.cloud_client.token or get_cloud_token()
            if not token:
                logger.info(
                    "Printer %s needs a Bambu Cloud account, but none is connected",
                    serial,
                )
                return
            self.cloud_client.token = token
            try:
                user_id = self.cloud_client.get_user_id()
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Could not resolve the Bambu Cloud user id for %s: %s",
                    serial,
                    exc,
                )
                self._schedule_reconnect(serial)
                return
            client.configure(
                settings.BAMBU_CLOUD_MQTT_HOST,
                serial,
                username=f"u_{user_id}",
                password=token,
                port=settings.BAMBU_CLOUD_MQTT_PORT,
            )

            if not client.is_configured:
                logger.info("Printer %s is not configured — MQTT skipped", serial)
                return

            with self._lock:
                if self._connect_epochs.get(serial, 0) != epoch:
                    return
            client.connect()

            canceled = False
            with self._lock:
                if self._connect_epochs.get(serial, 0) != epoch:
                    canceled = True
                elif serial not in self.clients:
                    self.clients[serial] = client
                else:
                    # Someone else registered a client while we connected.
                    canceled = True
            if canceled:
                client.disconnect()
        finally:
            with self._lock:
                self._connecting.discard(serial)

    def configure_and_connect(self) -> None:
        """Load all configured printers and start one MQTT client per printer."""
        with Session(engine) as session:
            printers = crud.get_printers(session=session)

        for printer in printers:
            self._connect(printer)

    def disconnect(self) -> None:
        with self._lock:
            for serial in self._connect_epochs:
                self._connect_epochs[serial] += 1
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
            self._connect_epochs[serial] = self._connect_epochs.get(serial, 0) + 1
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

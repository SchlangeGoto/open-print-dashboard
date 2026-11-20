import logging
import threading
import time
import uuid

from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.core.db import engine
from app.core.store import get_cloud_token, save_cloud_credentials, save_cloud_token
from app.core.tenancy import DEFAULT_TENANT_ID
from app.models import Printer
from app.services.bambu_client import BambuClient
from app.services.bambu_cloud import BambuCloudClient

logger = logging.getLogger("uvicorn.error")

ClientKey = tuple[uuid.UUID, str]


class PrinterService:
    """Owns the per-tenant cloud clients and MQTT connections.

    Every key includes the tenant id. Two tenants can therefore use printers
    with the same serial, and a broken Bambu account in one tenant does not
    affect the others.
    """

    def __init__(self) -> None:
        self.clients: dict[ClientKey, BambuClient] = {}
        self._cloud_clients: dict[uuid.UUID, BambuCloudClient] = {}
        # ``clients`` is touched from request threads and the MQTT threads.
        # Only the dict operations are guarded; connecting happens outside the
        # lock because it can block on the network.
        self._lock = threading.Lock()
        self._reconnect_timers: dict[ClientKey, threading.Timer] = {}
        # Only one automatic re-login may run per tenant at a time. A token that
        # Bambu rejects right after a successful login means the account needs a
        # human, so do not loop on the login endpoint.
        self._reauth_conditions: dict[uuid.UUID, threading.Condition] = {}
        self._reauthing: set[uuid.UUID] = set()
        self._last_reauth_ok: dict[uuid.UUID, bool] = {}
        self._last_reauth_at: dict[uuid.UUID, float] = {}
        self._reauth_cooldown = 60.0
        # Serialize connects per printer and cancel a connect that loses a
        # race with disconnect()/reload_printer().
        self._connecting: set[ClientKey] = set()
        self._connect_epochs: dict[ClientKey, int] = {}
        self._reconnect_pending: set[ClientKey] = set()

    @property
    def cloud_client(self) -> BambuCloudClient:
        """The Default tenant's client.

        Kept for tests and single-tenant tooling. Request handlers must resolve
        the client from their own tenant instead.
        """
        return self.get_cloud_client(DEFAULT_TENANT_ID)

    def get_cloud_client(self, tenant_id: uuid.UUID) -> BambuCloudClient:
        with self._lock:
            client = self._cloud_clients.get(tenant_id)
            if client is None:
                client = BambuCloudClient(tenant_id)
                self._cloud_clients[tenant_id] = client
            return client

    def get_token(self, tenant_id: uuid.UUID = DEFAULT_TENANT_ID) -> str | None:
        return self.get_cloud_client(tenant_id).token

    def login(
        self, tenant_id: uuid.UUID = DEFAULT_TENANT_ID, code: str | None = None
    ) -> None:
        self.get_cloud_client(tenant_id).login(code)
        self.save_token(tenant_id)
        self.save_credentials(tenant_id)
        # A fresh token is needed by the cloud MQTT clients, so reconnect
        # anything that was configured before the login.
        self.reload_tenant(tenant_id)

    def save_token(self, tenant_id: uuid.UUID = DEFAULT_TENANT_ID) -> None:
        token = self.get_cloud_client(tenant_id).token
        if token:
            save_cloud_token(token, tenant_id=tenant_id)

    def save_credentials(self, tenant_id: uuid.UUID = DEFAULT_TENANT_ID) -> None:
        client = self.get_cloud_client(tenant_id)
        if client.email and client.password:
            save_cloud_credentials(client.email, client.password, tenant_id=tenant_id)

    def _reauth_condition(self, tenant_id: uuid.UUID) -> threading.Condition:
        with self._lock:
            return self._reauth_conditions.setdefault(tenant_id, threading.Condition())

    def reauthenticate(self, tenant_id: uuid.UUID = DEFAULT_TENANT_ID) -> bool:
        """Log in again with the persisted Bambu Cloud credentials.

        Called by an MQTT client whose token was rejected. Concurrent callers
        in the same tenant share one login attempt instead of sending duplicate
        requests. A second attempt within the cooldown returns False so a token
        that Bambu keeps rejecting surfaces as "re-login required" instead of
        looping. Separate tenants have separate conditions, so one broken
        account cannot block the others.
        """
        condition = self._reauth_condition(tenant_id)
        with condition:
            with self._lock:
                already_running = tenant_id in self._reauthing
                last_attempt = self._last_reauth_at.get(tenant_id)
            if already_running:
                condition.wait_for(
                    lambda: not self._is_reauthing(tenant_id), timeout=60
                )
                with self._lock:
                    return self._last_reauth_ok.get(tenant_id, False)
            if (
                last_attempt is not None
                and time.monotonic() - last_attempt < self._reauth_cooldown
            ):
                return False
            with self._lock:
                self._reauthing.add(tenant_id)

        ok = False
        try:
            self.login(tenant_id)
            ok = True
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Bambu Cloud re-login failed for tenant %s: %s", tenant_id, exc
            )
        finally:
            with condition:
                with self._lock:
                    self._reauthing.discard(tenant_id)
                    self._last_reauth_ok[tenant_id] = ok
                    self._last_reauth_at[tenant_id] = time.monotonic()
                condition.notify_all()
        return ok

    def _is_reauthing(self, tenant_id: uuid.UUID) -> bool:
        with self._lock:
            return tenant_id in self._reauthing

    def _connect(self, tenant_id: uuid.UUID, printer: Printer) -> None:
        serial = printer.serial
        key = (tenant_id, serial)
        with self._lock:
            if key in self.clients:
                return
            if key in self._connecting:
                self._reconnect_pending.add(key)
                return
            self._connecting.add(key)
            epoch = self._connect_epochs.setdefault(key, 0)
        try:
            cloud_client = self.get_cloud_client(tenant_id)
            client = BambuClient(tenant_id=tenant_id)

            token = cloud_client.token or get_cloud_token(tenant_id)
            if not token:
                logger.info(
                    "Printer %s in tenant %s needs a Bambu Cloud account, but "
                    "none is connected",
                    serial,
                    tenant_id,
                )
                return
            cloud_client.token = token
            try:
                user_id = cloud_client.get_user_id()
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Could not resolve the Bambu Cloud user id for %s: %s",
                    serial,
                    exc,
                )
                self._schedule_reconnect(tenant_id, serial)
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
                if self._connect_epochs.get(key, 0) != epoch:
                    return
            client.connect()

            canceled = False
            with self._lock:
                if self._connect_epochs.get(key, 0) != epoch:
                    canceled = True
                elif key not in self.clients:
                    self.clients[key] = client
                else:
                    # Someone else registered a client while we connected.
                    canceled = True
            if canceled:
                client.disconnect()
        finally:
            retry = False
            with self._lock:
                self._connecting.discard(key)
                if key in self._reconnect_pending:
                    self._reconnect_pending.discard(key)
                    # A racing reload only needs a retry if this connect did
                    # not leave a healthy client behind; otherwise the retry
                    # would tear that client down again.
                    retry = key not in self.clients
            if retry:
                self._schedule_reconnect(tenant_id, serial, delay=0.5)

    def configure_and_connect(self) -> None:
        """Load every active tenant's printers and start their MQTT clients."""
        with Session(engine) as session:
            tenants = crud.get_tenants(session=session, active_only=True)
            printers = [
                (tenant.id, printer)
                for tenant in tenants
                for printer in crud.get_printers(session=session, tenant_id=tenant.id)
            ]

        for tenant_id, printer in printers:
            self._connect(tenant_id, printer)

    def disconnect(self) -> None:
        with self._lock:
            for key in self._connect_epochs:
                self._connect_epochs[key] += 1
            self._reconnect_pending.clear()
            clients = list(self.clients.values())
            self.clients.clear()
            timers = list(self._reconnect_timers.values())
            self._reconnect_timers.clear()
        for timer in timers:
            timer.cancel()
        for client in clients:
            client.disconnect()

    def disconnect_tenant(self, tenant_id: uuid.UUID) -> None:
        """Disconnect only one tenant, leaving the others untouched."""
        with self._lock:
            keys = {key for key in self._connect_epochs if key[0] == tenant_id} | {
                key for key in self._reconnect_timers if key[0] == tenant_id
            }
            for key in keys:
                self._connect_epochs[key] = self._connect_epochs.get(key, 0) + 1
            self._reconnect_pending = {
                key for key in self._reconnect_pending if key[0] != tenant_id
            }
            clients = [
                self.clients.pop(key)
                for key in list(self.clients)
                if key[0] == tenant_id
            ]
            timers = [
                self._reconnect_timers.pop(key)
                for key in list(self._reconnect_timers)
                if key[0] == tenant_id
            ]
        for timer in timers:
            timer.cancel()
        for client in clients:
            client.disconnect()

    def _schedule_reconnect(
        self,
        tenant_id: uuid.UUID,
        serial: str,
        delay: float = 60.0,
    ) -> None:
        """Retry a cloud connection that failed transiently."""
        key = (tenant_id, serial)
        with self._lock:
            if key in self._reconnect_timers:
                return

            def run() -> None:
                with self._lock:
                    self._reconnect_timers.pop(key, None)
                self.reload_printer(tenant_id, serial)

            timer = threading.Timer(delay, run)
            timer.daemon = True
            self._reconnect_timers[key] = timer
        timer.start()

    def reload(self) -> None:
        self.disconnect()
        self.configure_and_connect()

    def reload_tenant(self, tenant_id: uuid.UUID) -> None:
        self.disconnect_tenant(tenant_id)
        with Session(engine) as session:
            printers = crud.get_printers(session=session, tenant_id=tenant_id)
        for printer in printers:
            self._connect(tenant_id, printer)

    def reload_printer(self, tenant_id: uuid.UUID, serial: str) -> None:
        key = (tenant_id, serial)
        with self._lock:
            self._connect_epochs[key] = self._connect_epochs.get(key, 0) + 1
            client = self.clients.pop(key, None)
        if client:
            client.disconnect()

        with Session(engine) as session:
            printer = crud.get_printer_by_serial(
                session=session, serial=serial, tenant_id=tenant_id
            )
        if printer:
            self._connect(tenant_id, printer)

    def get_client(self, tenant_id: uuid.UUID, serial: str) -> BambuClient | None:
        with self._lock:
            return self.clients.get((tenant_id, serial))

    def get_status(self, tenant_id: uuid.UUID, serial: str) -> dict:
        client = self.get_client(tenant_id, serial)
        if client is None:
            return {"connected": False, "status": "no_data"}
        return client.get_status()

    def get_statuses(self, tenant_id: uuid.UUID) -> dict[str, dict]:
        with self._lock:
            clients = [
                (serial, client)
                for (client_tenant, serial), client in self.clients.items()
                if client_tenant == tenant_id
            ]
        return {serial: client.get_status() for serial, client in clients}


printer_service = PrinterService()

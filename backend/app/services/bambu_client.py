import json
import logging
import threading
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import paho.mqtt.client as mqtt
from sqlalchemy import func
from sqlmodel import Session, col, desc, select

from app.core.commands import GET_VERSION, PUSH_ALL, START_PUSH
from app.core.db import engine
from app.models import Filament, Printer, PrintJob, Spool
from app.services.bambu_catalog import BAMBU_COLOR_NAMES

logger = logging.getLogger("uvicorn.error")

WATCHDOG_TIMER = 60


def parse_task_datetime(value: Any) -> datetime | None:
    """Parse a Bambu task timestamp into an aware UTC datetime.

    The cloud task API mixes ISO strings and epoch numbers. Assigning either
    to a ``datetime`` column directly fails at the database bind, which rolls
    back both the print job and the filament deduction.
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, (int, float)):
        seconds = value / 1000 if value > 1_000_000_000_000 else value
        try:
            return datetime.fromtimestamp(seconds, tz=UTC)
        except (OSError, OverflowError, ValueError):
            return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return None


class WatchdogThread(threading.Thread):
    def __init__(self, client: "BambuClient"):
        super().__init__()
        self._client = client
        self._watchdog_fired = False
        self._stop_event = threading.Event()
        self._last_received_data = time.time()
        self.daemon = True

    def stop(self) -> None:
        self._stop_event.set()

    def received_data(self) -> None:
        self._last_received_data = time.time()

    def run(self) -> None:
        self.name = "Bambu-Watchdog"
        logger.debug("Watchdog thread started")

        while not self._stop_event.is_set():
            interval = time.time() - self._last_received_data
            wait_time = max(1, WATCHDOG_TIMER - interval)

            if self._stop_event.wait(wait_time):
                break

            interval = time.time() - self._last_received_data
            if not self._watchdog_fired and interval > WATCHDOG_TIMER:
                logger.warning(f"Watchdog fired — no data for {int(interval)}s")
                self._watchdog_fired = True
                self._client._publish(START_PUSH)
            elif interval < WATCHDOG_TIMER:
                self._watchdog_fired = False

        logger.debug("Watchdog thread exited")


class MqttThread(threading.Thread):
    def __init__(self, client: "BambuClient"):
        super().__init__()
        self._client = client
        self._stop_event = threading.Event()
        self.daemon = True

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        self.name = "Bambu-MQTT"
        last_exception = ""

        while not self._stop_event.is_set():
            try:
                logger.debug(f"Connecting to {self._client.host}:{self._client.port}")
                self._client.client.connect(
                    self._client.host,
                    self._client.port,
                    keepalive=self._client.keepalive,
                )
                last_exception = ""
                self._client.client.loop_forever()
                logger.debug("loop_forever exited cleanly")
                if self._client._auth_error:
                    # Re-login is attempted from the persisted credentials in
                    # _on_connect. Do not hammer the broker with the same stale
                    # token.
                    logger.warning(
                        "MQTT authentication failed — waiting for a re-login"
                    )
                    break
                break

            except TimeoutError as e:
                if last_exception != "TimeoutError":
                    logger.debug(f"TimeoutError: {e} — retrying in 5s")
                last_exception = "TimeoutError"
            except ConnectionRefusedError as e:
                if last_exception != "ConnectionRefusedError":
                    logger.debug(f"ConnectionRefused: {e} — retrying in 5s")
                last_exception = "ConnectionRefusedError"
            except ConnectionError as e:
                if last_exception != "ConnectionError":
                    logger.debug(f"ConnectionError: {e} — retrying in 5s")
                last_exception = "ConnectionError"
            except OSError as e:
                if e.errno == 113:
                    if last_exception != "OSError113":
                        logger.debug("Host unreachable — retrying in 5s")
                    last_exception = "OSError113"
                else:
                    logger.error(f"OSError: {e}")
            except Exception as e:
                logger.error(f"Unexpected MQTT error: {type(e)} {e}")

            if self._stop_event.wait(5):
                break

            try:
                self._client.client.disconnect()
            except Exception:
                pass


class BambuClient:
    def __init__(self) -> None:
        self.host: str | None = None
        self.port = 8883
        self.serial: str | None = None
        self.username: str | None = None
        self.password: str | None = None
        self.keepalive = 60

        self._client_id = f"open-print-{uuid.uuid4()}"
        self._connected = False
        self._auth_error = False
        self._reauth_started = False
        self._reauth_required = False
        self._last_seen: float | None = None
        self._current_status: dict = {}
        self._ams_signature: str | None = None
        self._last_ams_sync = 0.0
        self._ams_lock = threading.Lock()

        self.client: mqtt.Client | None = None
        self._mqtt_thread: MqttThread | None = None
        self._watchdog: WatchdogThread | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self.host and self.serial and self.username and self.password)

    def configure(
        self,
        host: str | None,
        serial: str | None,
        *,
        username: str | None = None,
        password: str | None = None,
        port: int = 8883,
    ) -> None:
        """Set the Bambu Cloud MQTT parameters and reset the cached status.

        The client connects to Bambu's cloud MQTT broker with the account's
        ``u_<uid>`` username and access token. Local/LAN MQTT is retired.
        """
        self.host = host
        self.port = port
        self.serial = serial
        self.username = username
        self.password = password
        self._connected = False
        self._auth_error = False
        self._reauth_started = False
        self._reauth_required = False
        self._last_seen = None
        self._current_status = {}
        self._ams_signature = None
        self._last_ams_sync = 0.0

    def connect(self) -> None:
        """Set up the MQTT client and start the background thread."""
        if not self.is_configured:
            logger.info("Printer is not configured yet — skipping MQTT connection")
            return

        self.client = mqtt.Client(
            client_id=self._client_id,
            protocol=mqtt.MQTTv311,
            clean_session=True,
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        )

        # Bambu's broker uses a publicly trusted certificate.
        self.client.tls_set()
        self.client.username_pw_set(self.username, password=self.password)
        self.client.reconnect_delay_set(min_delay=5, max_delay=120)

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        self._last_seen = time.monotonic()
        self._mqtt_thread = MqttThread(self)
        self._mqtt_thread.start()
        logger.info("MQTT thread started for %s", self.host)

    def disconnect(self) -> None:
        """Stop all threads and disconnect cleanly."""
        if self._mqtt_thread:
            self._mqtt_thread.stop()

        # Stop paho's network loop before joining. Otherwise the thread is
        # parked in loop_forever() and join() burns its full timeout.
        if self.client:
            try:
                self.client.disconnect()
                self.client.loop_stop()
            except Exception as e:
                logger.debug(f"Error during disconnect: {e}")

        if self._mqtt_thread:
            self._mqtt_thread.join(timeout=5)
            self._mqtt_thread = None

        if self._watchdog:
            self._watchdog.stop()
            self._watchdog.join(timeout=5)
            self._watchdog = None

        self.client = None
        self._connected = False
        logger.info("Disconnected from printer")

    def _on_connect(
        self, client, userdata, flags, reason_code, properties=None
    ) -> None:
        code = getattr(reason_code, "value", reason_code)
        if code == 0:
            logger.info("Connected to the Bambu Cloud MQTT broker at %s", self.host)
            self._connected = True
            self._auth_error = False
            self._reauth_required = False
            self._last_seen = time.monotonic()
            client.subscribe(f"device/{self.serial}/report")
            self._publish(GET_VERSION)
            self._publish(PUSH_ALL)
        else:
            codes = {
                1: "wrong protocol",
                2: "invalid client id",
                3: "server unavailable",
                4: "bad credentials",
                5: "not authorised",
            }
            self._connected = False
            self._auth_error = code in (4, 5)
            logger.error(
                "MQTT connection failed: %s",
                codes.get(code, code),
            )
            if self._auth_error:
                # Try the persisted Bambu credentials once; if that fails,
                # stay offline and ask for a manual sign-in.
                self._start_reauth()
                if self.client is not None:
                    self.client.disconnect()

    def _start_reauth(self) -> None:
        if self._reauth_started:
            return
        self._reauth_started = True
        threading.Thread(target=self._reauth, daemon=True).start()

    def _reauth(self) -> None:
        from app.services.printer_service import printer_service

        if not printer_service.reauthenticate():
            self._reauth_required = True
            logger.error("Bambu Cloud re-login failed; sign in again from Settings")

    def _on_disconnect(
        self,
        client,
        userdata,
        disconnect_flags,
        reason_code,
        properties=None,
    ) -> None:
        self._connected = False
        code = getattr(reason_code, "value", reason_code)
        if code in (4, 5):
            self._auth_error = True
            try:
                # Stop the reconnect loop so the MqttThread can back off.
                client.disconnect()
            except Exception:
                pass
        if self._watchdog:
            self._watchdog.stop()
            self._watchdog.join(timeout=5)
            self._watchdog = None

        if code == 0:
            logger.info("Disconnected cleanly")
        else:
            logger.warning(f"Disconnected unexpectedly (reason={code})")

    def _on_message(self, client, userdata, message) -> None:
        try:
            if self.client is None:
                return
            data = json.loads(message.payload)
            self._last_seen = time.monotonic()
            self._connected = True

            # Start the watchdog on the first report, not on broker connect.
            # With a cloud connection the broker can stay connected while the
            # printer is offline; starting here avoids pointless START_PUSH
            # traffic in that state.
            if self._watchdog is None:
                self._watchdog = WatchdogThread(self)
                self._watchdog.start()
            else:
                self._watchdog.received_data()

            if data.get("print"):
                self._handle_print_update(data["print"])
            elif data.get("info"):
                self._handle_info_update(data["info"])
            elif data.get("event"):
                self._handle_event(data["event"])
            else:
                # unknown top-level key — log and merge anyway
                logger.debug(f"Unknown message keys: {list(data.keys())}")
                self._current_status.update(data)

        except Exception as e:
            logger.error(f"Error processing message: {e}")

    def _ams_signature_for(self, ams: dict) -> str:
        """Signature of tray identity and usage, ignoring sensor values.

        The raw AMS blob carries per-unit temperature and humidity, so it
        changes on nearly every report. Identity, preset and remaining weight
        are what a sync actually depends on.
        """
        trays = [
            (
                tray.get("tag_uid"),
                tray.get("remain"),
                tray.get("tray_info_idx"),
            )
            for unit in ams.get("ams", [])
            for tray in unit.get("tray", [])
        ]
        return json.dumps(
            {"trays": trays, "tray_now": self._current_status.get("tray_now")},
            sort_keys=True,
        )

    def _handle_print_update(self, print_data: dict) -> None:
        """Merge incoming print data into current status."""
        command = print_data.get("command")
        logger.debug(f"Print update: command={command}")

        old_state = self._current_status.get("gcode_state")
        self._current_status.update(print_data)
        new_state = self._current_status.get("gcode_state")

        ams = self._current_status.get("ams")
        if ams:
            signature = self._ams_signature_for(ams)
            now = time.time()
            if signature != self._ams_signature and now - self._last_ams_sync > 2:
                self._ams_signature = signature
                self._last_ams_sync = now
                threading.Thread(
                    target=self._sync_ams_trays,
                    args=(ams, signature),
                    daemon=True,
                ).start()

        if (
            old_state in ("IDLE", "FINISH", "FAILED", "PREPARE")
            and new_state == "RUNNING"
        ):
            logger.info("Print started")
            self._on_print_started(self._current_task_id())

        if old_state == "RUNNING" and new_state in ("FINISH", "FAILED"):
            logger.info(f"Print finished with state: {new_state}")
            self._on_print_finished(new_state, self._current_task_id())

    def _current_task_id(self) -> str | None:
        """Return the cloud task id reported by the printer, if any."""
        task_id = self._current_status.get("task_id")
        # "0" is what the printer reports for an SD-card print without a cloud
        # task; treat it as unknown so the caller falls back to the account
        # task list.
        if task_id in (None, "", 0, "0"):
            return None
        return str(task_id)

    def _on_print_finished(self, state: str, task_id: str | None = None) -> None:
        """Called when a print completes or fails."""
        t = threading.Thread(target=self._save_print_job, args=(task_id,), daemon=True)
        t.start()

    def _on_print_started(self, task_id: str | None = None) -> None:
        t = threading.Thread(
            target=self._save_print_job_init, args=(task_id,), daemon=True
        )
        t.start()

    def _active_spool(self, session: Session) -> Spool | None:
        """Return the spool loaded in this printer, not another printer.

        ``printer_id`` alone is not enough: a stale ``active = false`` row can
        keep the id after an interrupted move. The oldest current spool wins.
        """
        if not self.serial:
            return None
        printer = session.exec(
            select(Printer).where(Printer.serial == self.serial)
        ).first()
        if not printer:
            return None
        return session.exec(
            select(Spool)
            .where(Spool.printer_id == printer.id)
            .where(col(Spool.active).is_(True))
            .order_by(col(Spool.created_at).asc(), col(Spool.id).asc())
        ).first()

    @staticmethod
    def _real_tag(tag: str | None) -> str | None:
        value = (tag or "").strip()
        if not value or set(value) <= {"0"}:
            return None
        return value

    @staticmethod
    def _tray_color(tray: dict) -> str | None:
        raw = str(tray.get("tray_color") or "").strip().lstrip("#")
        if len(raw) < 6:
            return None
        return f"#{raw[:6].lower()}"

    @staticmethod
    def _tray_weight(tray: dict) -> float:
        try:
            value = float(tray.get("tray_weight") or 0)
        except (TypeError, ValueError):
            value = 0
        return value if value > 0 else 1000.0

    @staticmethod
    def _tray_remain_percent(tray: dict) -> float | None:
        """Return the AMS percentage, or None when it has no measurement."""
        raw = tray.get("remain")
        if raw is None:
            return None
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return None
        if value < 0:
            return None
        return max(0.0, min(100.0, value))

    @staticmethod
    def _tray_remaining(tray: dict, total: float) -> float | None:
        pct = BambuClient._tray_remain_percent(tray)
        if pct is None:
            return None
        return round(max(0.0, min(total, total * pct / 100)), 1)

    def _ams_filament(self, session: Session, tray: dict) -> Filament:
        info_idx = tray.get("tray_info_idx") or tray.get("setting_id") or None
        color = self._tray_color(tray)
        material = str(tray.get("tray_type") or "Unknown")
        series = str(tray.get("tray_sub_brands") or "")
        label = str(tray.get("tray_id_name") or "")
        brand = (
            "Bambu Lab"
            if info_idx
            and str(info_idx).startswith("GF")
            and not str(info_idx).endswith(("98", "99"))
            else "Unknown"
        )

        filament = None
        if info_idx:
            filament = session.exec(
                select(Filament)
                .where(
                    Filament.bambu_info_idx == info_idx,
                    func.lower(Filament.color_hex) == (color or "").lower(),
                )
                .order_by(col(Filament.created_at).asc())
            ).first()
        if not filament and color:
            # The AMS sometimes reports a different preset id than the box
            # catalog. Fall back to brand + material + colour so a tray does
            # not attach to another brand's filament.
            filament = session.exec(
                select(Filament)
                .where(
                    func.lower(Filament.color_hex) == color.lower(),
                    func.lower(Filament.material) == material.lower(),
                    func.lower(Filament.brand) == brand.lower(),
                )
                .order_by(col(Filament.created_at).asc())
            ).first()
        if filament:
            return filament

        def temp(key: str) -> int | None:
            try:
                value = int(float(tray.get(key) or 0))
            except (TypeError, ValueError):
                return None
            return value or None

        filament = Filament(
            brand=brand,
            material=material,
            color_name=(
                label
                or BAMBU_COLOR_NAMES.get(color or "")
                or f"{series or material} {color or ''}".strip()
            ),
            color_hex=color or "#9ca3af",
            nozzle_temp_min=temp("nozzle_temp_min"),
            nozzle_temp_max=temp("nozzle_temp_max"),
            bed_temp=temp("bed_temp"),
            bambu_info_idx=str(info_idx) if info_idx else None,
            spool_weight_g=self._tray_weight(tray),
            notes="Auto-created from AMS",
        )
        session.add(filament)
        session.flush()
        return filament

    def _match_untagged_spool(
        self,
        session: Session,
        filament_id: uuid.UUID,
        remaining: float | None,
    ) -> Spool | None:
        """Return an untagged spool whose weight matches the AMS estimate.

        FIFO decides between equally plausible spools. A tray whose estimate is
        unknown never adopts anything, and a partial tray never adopts a full
        spool, because the weight difference is too large.
        """
        if remaining is None:
            return None
        candidates = session.exec(
            select(Spool)
            .where(
                Spool.filament_id == filament_id,
                col(Spool.tag_uid).is_(None),
                col(Spool.printer_id).is_(None),
                col(Spool.remaining_unknown).is_(False),
            )
            .order_by(col(Spool.created_at).asc(), col(Spool.id).asc())
        ).all()
        for candidate in candidates:
            tolerance = max(50.0, candidate.total_weight_g * 0.15)
            if abs(candidate.remaining_g - remaining) <= tolerance:
                return candidate
        return None

    def _sync_ams_trays(self, ams: dict, signature: str) -> None:
        if not self.serial:
            return
        with self._ams_lock:
            ok = self._sync_ams_trays_inner(ams)
        if not ok and self._ams_signature == signature:
            # Let the next identical report retry a failed sync.
            self._ams_signature = None

    def _sync_ams_trays_inner(self, ams: dict) -> bool:
        """Create and update spools from AMS trays reported by the printer."""
        try:
            with Session(engine) as session:
                printer = session.exec(
                    select(Printer).where(Printer.serial == self.serial)
                ).first()
                if not printer:
                    return True

                try:
                    tray_now = int(self._current_status.get("tray_now"))
                except (TypeError, ValueError):
                    tray_now = None

                active_spool: Spool | None = None
                trays: list[tuple[dict, bool]] = []
                for unit in ams.get("ams", []):
                    try:
                        ams_id = int(unit.get("id") or 0)
                    except (TypeError, ValueError):
                        ams_id = 0
                    for tray in unit.get("tray", []):
                        try:
                            tray_id = int(tray.get("id") or 0)
                        except (TypeError, ValueError):
                            tray_id = 0
                        trays.append((tray, tray_now == (ams_id * 4 + tray_id)))

                external = self._current_status.get("vt_tray")
                if external:
                    trays.append((external, tray_now == 254))

                for tray, is_active in trays:
                    tag = self._real_tag(tray.get("tag_uid"))
                    if not tag:
                        continue
                    total = self._tray_weight(tray)
                    remaining = self._tray_remaining(tray, total)
                    spool = session.exec(
                        select(Spool).where(Spool.tag_uid == tag)
                    ).first()
                    if not spool:
                        filament = self._ams_filament(session, tray)
                        # The barcode is SKU-level, so identical spools cannot
                        # be told apart until the AMS reads their RFID tags.
                        # Adopt an untagged spool only when its recorded weight
                        # is close to the AMS estimate; a partial tray must
                        # never consume a full library spool.
                        spool = self._match_untagged_spool(
                            session, filament.id, remaining
                        )
                        if spool:
                            spool.tag_uid = tag
                            scaled = self._tray_remaining(tray, spool.total_weight_g)
                            if scaled is not None:
                                spool.remaining_g = scaled
                                spool.remaining_unknown = False
                            session.add(spool)
                        else:
                            spool = Spool(
                                filament_id=filament.id,
                                total_weight_g=total,
                                # Keep the nominal capacity as a placeholder;
                                # the flag keeps it out of stock math and the
                                # UI shows "unknown" instead.
                                remaining_g=(
                                    remaining if remaining is not None else total
                                ),
                                remaining_unknown=remaining is None,
                                tag_uid=tag,
                                source="ams",
                            )
                            session.add(spool)
                        session.flush()
                    else:
                        if remaining is not None:
                            scaled = self._tray_remaining(tray, spool.total_weight_g)
                            if scaled is not None:
                                spool.remaining_g = scaled
                                spool.remaining_unknown = False
                        if is_active:
                            spool.last_used_at = datetime.now(UTC)

                    if is_active:
                        active_spool = spool

                if active_spool:
                    for other in session.exec(
                        select(Spool).where(
                            Spool.printer_id == printer.id,
                            col(Spool.id) != active_spool.id,
                        )
                    ).all():
                        other.active = False
                        other.printer_id = None
                    # Flush the unload before the new active row is written;
                    # the partial unique index checks each row as it lands.
                    session.flush()
                    active_spool.active = True
                    active_spool.printer_id = printer.id

                session.commit()
                if active_spool:
                    logger.info(
                        "AMS synced %s trays; active spool %s",
                        len(trays),
                        active_spool.id,
                    )
                return True
        except Exception as exc:
            logger.error("AMS sync failed: %s", exc)
            return False

    def _fetch_cloud_task(self, task_id: str | None) -> dict | None:
        """Fetch the task that the printer reported, not just the newest one."""
        from app.services.printer_service import printer_service

        if task_id:
            return printer_service.cloud_client.get_task(task_id)
        return printer_service.cloud_client.get_latest_task_for_printer(self.serial)

    def _save_print_job_init(self, task_id: str | None = None) -> None:
        """Fetch cloud data and save a PrintJob when a print starts."""
        try:
            task = self._fetch_cloud_task(task_id)
            if not task:
                logger.warning("No cloud task found on print start")
                return

            trys = 0
            maxTrys = 30
            while task.get("status") != 4 and trys < maxTrys:
                time.sleep(1)
                trys += 1
                task = self._fetch_cloud_task(task_id)
                if not task:
                    break

            if trys >= maxTrys:
                logger.error(f"Failed to fetch cloud task after {maxTrys} tries")
                return

            if not task or task.get("status") != 4:
                logger.warning("Task %s never reached the printing state", task_id)
                return

            cloud_task_id = str(task.get("id"))
            if task_id and cloud_task_id != task_id:
                logger.warning(
                    "Cloud returned task %s instead of %s; skipping job",
                    cloud_task_id,
                    task_id,
                )
                return

            with Session(engine) as session:
                active_spool = self._active_spool(session)

                existing = session.exec(
                    select(PrintJob).where(
                        PrintJob.device_id == self.serial,
                        PrintJob.bambu_task_id == cloud_task_id,
                    )
                ).first()
                if existing:
                    # A FAILED -> RUNNING retry reports the same task again;
                    # updating is fine, inserting a duplicate is not.
                    logger.info("PrintJob already exists for task %s", cloud_task_id)
                    return

                job = PrintJob(
                    spool_id=active_spool.id if active_spool else None,
                    filament_id=active_spool.filament_id if active_spool else None,
                    title=task.get(
                        "title", self._current_status.get("subtask_name", "Unknown")
                    ),
                    cover=task.get("cover"),
                    weight=task.get("weight"),
                    duration_seconds=task.get("costTime"),
                    start_time=parse_task_datetime(task.get("startTime")),
                    status=task.get("status"),
                    bambu_task_id=cloud_task_id,
                    device_id=self.serial,
                    ams_detail_mapping=str(task.get("amsDetailMapping", [])),
                )
                session.add(job)
                session.commit()
                logger.info(f"PrintJob saved: {job.title} — {task.get('weight')}g used")

        except Exception as e:
            logger.error(f"Failed to save print job: {e}")

    def _save_print_job(self, task_id: str | None = None) -> None:
        """Update the PrintJob and deduct filament once when a print finishes."""
        try:
            task = self._fetch_cloud_task(task_id)

            if not task:
                logger.warning("No cloud task found after print finished")
                return

            logger.info("Print finished — waiting for cloud to catch up...")

            trys = 0
            maxTrys = 30
            while task.get("status") == 4 and trys < maxTrys:
                time.sleep(1)
                trys += 1
                task = self._fetch_cloud_task(task_id)
                if not task:
                    break

            if trys >= maxTrys:
                logger.error(f"Failed to fetch cloud task after {maxTrys} tries")
                return

            if not task or task.get("status") == 4:
                logger.warning(
                    "Task %s was still printing when polling stopped", task_id
                )
                return

            cloud_task_id = str(task.get("id"))
            if task_id and cloud_task_id != task_id:
                logger.warning(
                    "Cloud returned task %s instead of the finished %s; skipping",
                    cloud_task_id,
                    task_id,
                )
                return

            with Session(engine) as session:
                active_spool = self._active_spool(session)

                estimated_cost = None
                if active_spool and task.get("weight"):
                    recent_spools = session.exec(
                        select(Spool)
                        .where(Spool.filament_id == active_spool.filament_id)
                        .where(Spool.price_per_kg.is_not(None))
                        .order_by(desc(Spool.created_at))
                        .limit(5)
                    ).all()

                    if recent_spools:
                        avg_price = sum(
                            s.price_per_kg for s in recent_spools if s.price_per_kg
                        ) / len(recent_spools)
                        estimated_cost = round((task["weight"] / 1000) * avg_price, 2)
                        logger.info(
                            f"Estimated cost: €{estimated_cost} (avg €{avg_price}/kg)"
                        )

                job = session.exec(
                    select(PrintJob)
                    .where(PrintJob.device_id == self.serial)
                    .where(PrintJob.bambu_task_id == cloud_task_id)
                    .with_for_update()
                ).first()

                if not job:
                    job = PrintJob(
                        bambu_task_id=cloud_task_id,
                        device_id=self.serial or "",
                    )
                    session.add(job)

                job.spool_id = active_spool.id if active_spool else None
                # Keep the filament set at start even if the spool was deleted
                # before the print finished.
                if active_spool:
                    job.filament_id = active_spool.filament_id
                job.title = task.get("title")
                job.cover = task.get("cover")
                job.weight = task.get("weight")
                job.estimated_cost = estimated_cost
                job.duration_seconds = task.get("costTime")
                job.start_time = parse_task_datetime(task.get("startTime"))
                job.finished_at = parse_task_datetime(task.get("endTime"))
                job.status = task.get("status")
                job.bambu_task_id = cloud_task_id
                job.device_id = self.serial
                job.ams_detail_mapping = str(task.get("amsDetailMapping", []))

                session.add(job)

                # A repeated finish event must not deduct the same weight
                # twice. The row lock makes the check safe across threads.
                if job.filament_deducted_at is None:
                    self._deduct_filament_from_spools(session, task)
                    job.filament_deducted_at = datetime.now(UTC)

                session.commit()
                logger.info(f"PrintJob saved: {job.title} — {task.get('weight')}g used")

        except Exception as e:
            logger.error(f"Failed to save print job: {e}")

    def _deduct_filament_from_spools(self, session: Session, task: dict) -> None:
        """Deduct filament usage per color slot from the correct spools.

        Falls back to deducting from the active spool if mapping is unavailable.
        """
        ams_mapping = task.get("amsDetailMapping", [])
        printer = session.exec(
            select(Printer).where(Printer.serial == self.serial)
        ).first()
        printer_id = printer.id if printer else None

        if not ams_mapping:
            active_spool = self._active_spool(session)
            if (
                active_spool
                and task.get("weight")
                and not active_spool.remaining_unknown
            ):
                active_spool.remaining_g = max(
                    0, active_spool.remaining_g - task["weight"]
                )
                active_spool.last_used_at = datetime.now(UTC)
                logger.info(
                    f"Deducted {task['weight']}g from active spool {active_spool.id}"
                )
            return

        for slot in ams_mapping:
            used_g = slot.get("weight", 0)
            if not used_g:
                continue

            filament_id = slot.get("filamentId")  # e.g. "GFL99"
            filament_type = slot.get("filamentType")  # e.g. "PLA"

            spool = None
            if printer_id:
                spool = session.exec(
                    select(Spool)
                    .join(Filament, Spool.filament_id == Filament.id)
                    .where(Filament.bambu_info_idx == filament_id)
                    .where(Spool.printer_id == printer_id)
                ).first()

            if not spool:
                spool = self._active_spool(session)

            if spool and spool.remaining_unknown:
                logger.info(
                    "Skipped %sg deduction: spool %s has unknown weight",
                    used_g,
                    spool.id,
                )
            elif spool:
                spool.remaining_g = max(0, spool.remaining_g - used_g)
                spool.last_used_at = datetime.now(UTC)
                logger.info(
                    f"Deducted {used_g}g ({filament_type}) from spool {spool.id}"
                )

    def _handle_info_update(self, info_data: dict) -> None:
        """Handle firmware version info."""
        command = info_data.get("command")
        logger.debug(f"Info update: command={command}")
        if command == "get_version":
            modules = info_data.get("module", [])
            for m in modules:
                if m.get("name") == "ota":
                    logger.info(f"Firmware version: {m.get('sw_ver')}")

    def _handle_event(self, event_data: dict) -> None:
        """Handle cloud MQTT events (printer online/offline)."""
        event = event_data.get("event")
        if event == "client.connected":
            logger.info("Printer came online")
            self._connected = True
            self._last_seen = time.monotonic()
            self._publish(PUSH_ALL)
        elif event == "client.disconnected":
            logger.info("Printer went offline")
            self._connected = False

    def _publish(self, payload: dict) -> bool:
        if not self.client:
            return False
        topic = f"device/{self.serial}/request"
        result = self.client.publish(topic, json.dumps(payload))
        if result.rc == 0:
            logger.debug(f"Published to {topic}: {payload}")
            return True
        logger.error(f"Failed to publish to {topic}")
        return False

    def get_status(self) -> dict:
        """Return the latest known printer status.

        With a cloud connection the MQTT client stays connected to Bambu's
        broker even while the printer is offline, so a printer that has not
        sent a report for three minutes is reported as offline.
        """
        connected = self._connected
        if (
            connected
            and self._last_seen is not None
            and time.monotonic() - self._last_seen > 180
        ):
            connected = False
        reauth_required = self._reauth_required
        if not self._current_status:
            return {
                "connected": connected,
                "status": "no_data",
                "reauth_required": reauth_required,
            }
        return {
            **self._current_status,
            "connected": connected,
            "reauth_required": reauth_required,
        }

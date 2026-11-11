import json
import logging
import threading
import time
import uuid
from collections import OrderedDict
from datetime import UTC, datetime, timedelta
from typing import Any

import paho.mqtt.client as mqtt
from sqlalchemy import func, or_, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlmodel import Session, col, desc, select

from app.core.commands import GET_VERSION, PUSH_ALL, START_PUSH
from app.core.db import engine
from app.models import Filament, Printer, PrintJob, Spool
from app.services.bambu_catalog import BAMBU_COLOR_NAMES, catalog_series_for

logger = logging.getLogger("uvicorn.error")

WATCHDOG_TIMER = 60
# The account task list lags the printer briefly around a finish.
TASK_LOOKUP_RETRIES = 3
TASK_LOOKUP_DELAY = 1.0
# A deferred finish is retried on the next reports/reconcile passes.
MAX_FINISH_ATTEMPTS = 3
RECONCILE_INTERVAL = 300
DEDUCTION_RETRY_HOURS = 6
STALE_OPEN_JOB_HOURS = 24


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
        self._last_reconcile = 0.0
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

            if time.time() - self._last_reconcile >= RECONCILE_INTERVAL:
                self._last_reconcile = time.time()
                threading.Thread(
                    target=self._client._reconcile_open_jobs, daemon=True
                ).start()

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
        self._ams_failures = 0
        self._ams_retry_after = 0.0
        self._ams_lock = threading.Lock()
        # A finish whose AMS mapping cannot be resolved yet is retried once
        # the first report has populated the tray tags.
        self._reconcile_on_ams = False
        # Task ids observed via a start event. If the start row insert was
        # lost, a later finish may recover it; a finish with no observation
        # is an old print (or a user-deleted record) and must be ignored.
        self._started_tasks: OrderedDict[str, float] = OrderedDict()
        self._started_lock = threading.Lock()
        self._reconcile_lock = threading.Lock()

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
        self._ams_failures = 0
        self._ams_retry_after = 0.0
        self._reconcile_on_ams = False

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
            # Close jobs that finished while the backend was offline; the
            # live report may only show their final state, not the edge.
            threading.Thread(target=self._reconcile_open_jobs, daemon=True).start()
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
            if (
                signature != self._ams_signature
                and now >= self._ams_retry_after
                and now - self._last_ams_sync > 2
            ):
                self._ams_signature = signature
                self._last_ams_sync = now
                threading.Thread(
                    target=self._sync_ams_trays,
                    args=(ams, signature),
                    daemon=True,
                ).start()

        if self._reconcile_on_ams and ams:
            self._reconcile_on_ams = False
            threading.Thread(target=self._reconcile_open_jobs, daemon=True).start()

        if (
            old_state in (None, "IDLE", "FINISH", "FAILED", "PREPARE", "PAUSE")
            and new_state == "RUNNING"
        ):
            task_id = self._current_task_id()
            self._clear_finish_request(task_id)
            logger.info("Print started")
            self._on_print_started(task_id)

        # After a restart the first report is already RUNNING or FINISH, so
        # waiting for a witnessed RUNNING -> FINISH edge loses the print.
        # The finish handler is idempotent, so a repeated edge is harmless.
        if old_state in (None, "RUNNING", "PAUSE") and new_state in (
            "FINISH",
            "FAILED",
        ):
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
        t = threading.Thread(
            target=self._save_print_job, args=(task_id, state), daemon=True
        )
        t.start()

    def _remember_started_task(self, task_id: str | None) -> None:
        if not task_id:
            return
        key = str(task_id)
        with self._started_lock:
            self._started_tasks[key] = time.monotonic()
            self._started_tasks.move_to_end(key)
            while len(self._started_tasks) > 64:
                self._started_tasks.popitem(last=False)

    def _was_started(self, task_id: str | None) -> bool:
        if not task_id:
            return False
        with self._started_lock:
            return str(task_id) in self._started_tasks

    def forget_started_task(self, task_id: str | None) -> None:
        """Stop treating a task as a genuine print after the user deletes it."""
        if not task_id:
            return
        with self._started_lock:
            self._started_tasks.pop(str(task_id), None)

    def _clear_finish_request(self, task_id: str | None) -> None:
        """A RUNNING edge starts a fresh finish budget for a retried task."""
        if not task_id or not self.serial:
            return
        try:
            with Session(engine) as session:
                job = session.exec(
                    select(PrintJob)
                    .where(PrintJob.device_id == self.serial)
                    .where(PrintJob.bambu_task_id == str(task_id))
                ).first()
                if not job:
                    return
                job.status = 4
                job.finished_at = None
                job.finish_requested_at = None
                job.finish_attempts = 0
                job.finish_state = None
                session.add(job)
                session.commit()
        except Exception as exc:
            logger.error("Could not clear the finish budget for %s: %s", task_id, exc)

    def _ensure_open_placeholder(self, task_id: str) -> None:
        """Create an open row for a start whose insert was lost."""
        if not self.serial:
            return
        try:
            with Session(engine) as session:
                existing = session.exec(
                    select(PrintJob)
                    .where(PrintJob.device_id == self.serial)
                    .where(PrintJob.bambu_task_id == str(task_id))
                ).first()
                if existing:
                    return
                session.execute(
                    pg_insert(PrintJob)
                    .values(
                        id=uuid.uuid4(),
                        title="Unknown",
                        status=4,
                        bambu_task_id=str(task_id),
                        device_id=self.serial,
                    )
                    .on_conflict_do_nothing(
                        index_elements=["device_id", "bambu_task_id"]
                    )
                )
                session.commit()
                logger.info("Created a placeholder for observed start %s", task_id)
        except Exception as exc:
            logger.error("Could not create a placeholder for task %s: %s", task_id, exc)

    def _defer_finish(self, task_id: str | None, state: str | None) -> None:
        """Persist a finish request that cannot be processed yet."""
        if not task_id or not self.serial:
            return
        try:
            with Session(engine) as session:
                job = session.exec(
                    select(PrintJob)
                    .where(PrintJob.device_id == self.serial)
                    .where(PrintJob.bambu_task_id == str(task_id))
                ).first()
                if not job or job.status != 4:
                    return
                now = datetime.now(UTC)
                if job.finish_requested_at is None:
                    job.finish_requested_at = now
                job.finish_attempts = (job.finish_attempts or 0) + 1
                if state:
                    job.finish_state = state
                if job.finish_attempts >= MAX_FINISH_ATTEMPTS:
                    job.status = 2 if (job.finish_state or "FINISH") == "FINISH" else 3
                    job.finished_at = job.finished_at or now
                    logger.warning(
                        "Giving up on task %s after %s finish attempts; "
                        "closing as status %s without a deduction",
                        task_id,
                        job.finish_attempts,
                        job.status,
                    )
                session.add(job)
                session.commit()
        except Exception as exc:
            logger.error("Could not record the finish retry for %s: %s", task_id, exc)

    def _on_print_started(self, task_id: str | None = None) -> None:
        self._remember_started_task(task_id)
        t = threading.Thread(
            target=self._save_print_job_init, args=(task_id,), daemon=True
        )
        t.start()

    def _close_stale_job(self, task_id: str) -> None:
        """Close a status-4 job whose cloud task has been missing for too long."""
        if not self.serial:
            return
        try:
            with Session(engine) as session:
                job = session.exec(
                    select(PrintJob)
                    .where(PrintJob.device_id == self.serial)
                    .where(PrintJob.bambu_task_id == task_id)
                ).first()
                if not job or job.status != 4:
                    return
                now = datetime.now(UTC)
                state = self._current_status.get("gcode_state")
                failed = state == "FAILED"
                job.status = 3 if failed else 2
                job.finished_at = now
                job.finish_requested_at = job.finish_requested_at or now
                job.finish_state = job.finish_state or (
                    "FAILED" if failed else "FINISH"
                )
                session.add(job)
                session.commit()
                logger.warning(
                    "Closed stale open job %s after %s hours without a task",
                    task_id,
                    STALE_OPEN_JOB_HOURS,
                )
        except Exception as exc:
            logger.error("Could not close stale job %s: %s", task_id, exc)

    def _deduct_persisted_job(self, task_id: str, task: dict | None) -> None:
        """Deduct a closed job from its stored mapping when the cloud lags."""
        try:
            with Session(engine) as session:
                job = session.exec(
                    select(PrintJob)
                    .where(PrintJob.device_id == self.serial)
                    .where(PrintJob.bambu_task_id == task_id)
                ).first()
                if not job or job.status == 4 or job.filament_deducted_at is not None:
                    return

                persisted: list[dict] = []
                if job.ams_detail_mapping:
                    try:
                        parsed = json.loads(job.ams_detail_mapping)
                        if isinstance(parsed, list):
                            persisted = parsed
                    except json.JSONDecodeError:
                        persisted = []
                task_mapping = (task or {}).get("amsDetailMapping") or []
                mapping = task_mapping if task_mapping else persisted
                weight = (task or {}).get("weight") or job.weight

                if mapping:
                    total = 0.0
                    for slot in mapping:
                        try:
                            total += float(slot.get("weight") or 0)
                        except (TypeError, ValueError):
                            continue
                    if total <= 0:
                        return
                elif not weight:
                    return

                if mapping:
                    ams = self._current_status.get("ams")
                    if not ams:
                        self._reconcile_on_ams = True
                        return
                    if not self._sync_ams_trays(ams, self._ams_signature_for(ams)):
                        return

                if self._claim_filament_deduction(session, job.id):
                    self._deduct_filament_from_spools(
                        session,
                        {"weight": weight, "amsDetailMapping": mapping},
                    )
                    session.commit()
                    logger.info("Deducted the persisted payload for task %s", task_id)
        except Exception as exc:
            logger.error("Could not deduct the persisted job %s: %s", task_id, exc)

    def _reconcile_open_jobs(self) -> None:
        """Retry open jobs and finished jobs whose deduction was deferred."""
        if not self.serial:
            return
        if not self._reconcile_lock.acquire(blocking=False):
            return
        try:
            cutoff = datetime.now(UTC) - timedelta(hours=DEDUCTION_RETRY_HOURS)
            with Session(engine) as session:
                open_rows = session.exec(
                    select(
                        PrintJob.bambu_task_id,
                        PrintJob.finish_requested_at,
                        PrintJob.start_time,
                        PrintJob.created_at,
                    )
                    .where(PrintJob.device_id == self.serial)
                    .where(PrintJob.status == 4)
                    .where(col(PrintJob.bambu_task_id).is_not(None))
                ).all()
                open_ids = [row[0] for row in open_rows]
                requested_ids = {row[0] for row in open_rows if row[1] is not None}
                open_started = {
                    row[0]: (row[2] or row[3]) for row in open_rows if row[0]
                }
                pending_ids = session.exec(
                    select(PrintJob.bambu_task_id)
                    .where(PrintJob.device_id == self.serial)
                    .where(PrintJob.status != 4)
                    .where(col(PrintJob.status).is_not(None))
                    .where(col(PrintJob.filament_deducted_at).is_(None))
                    .where(col(PrintJob.bambu_task_id).is_not(None))
                    .where(col(PrintJob.finished_at).is_not(None))
                    .where(col(PrintJob.finished_at) >= cutoff)
                ).all()

            pending_set = set(pending_ids)
            for task_id in dict.fromkeys([*open_ids, *pending_ids]):
                if task_id is None:
                    continue
                try:
                    task = self._fetch_cloud_task(str(task_id))
                    if not task or task.get("status") == 4:
                        if task_id in pending_set:
                            # The job is already closed locally. Deduct from
                            # the stored mapping even if the cloud stays at 4.
                            self._deduct_persisted_job(str(task_id), task)
                        elif task is None and task_id in requested_ids:
                            # Only a finish that was already observed may
                            # start the bounded close countdown; a running
                            # print with a lagging task list must stay open.
                            last_state = self._current_status.get("gcode_state")
                            self._defer_finish(
                                str(task_id),
                                last_state
                                if last_state in ("FINISH", "FAILED")
                                else None,
                            )
                        elif task is None:
                            started = open_started.get(task_id)
                            if started and started < datetime.now(UTC) - timedelta(
                                hours=STALE_OPEN_JOB_HOURS
                            ):
                                self._close_stale_job(str(task_id))
                        continue
                    state = "FINISH" if task.get("status") == 2 else "FAILED"
                    self._save_print_job(str(task_id), state, task)
                except Exception as exc:
                    # One unreadable task must not block the remaining jobs.
                    logger.error("Could not reconcile print task %s: %s", task_id, exc)
        except Exception as exc:
            logger.error("Print job reconciliation failed: %s", exc)
        finally:
            self._reconcile_lock.release()

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
    def _reported_tray_weight(tray: dict) -> float | None:
        try:
            value = float(tray.get("tray_weight") or 0)
        except (TypeError, ValueError):
            return None
        return value if value > 0 else None

    @staticmethod
    def _tray_weight(tray: dict) -> float:
        return BambuClient._reported_tray_weight(tray) or 1000.0

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
            # catalog. Fall back to brand + material + colour (+ series when
            # the tray names one) so a tray does not attach to another brand's
            # filament or collapse the white Support SKUs.
            weight = self._reported_tray_weight(tray)
            base = select(Filament).where(
                func.lower(Filament.color_hex) == color.lower(),
                func.lower(Filament.material) == material.lower(),
                func.lower(Filament.brand) == brand.lower(),
            )
            if series:
                # The series identifies the product. A package weight that
                # differs from the stored default is still the same product,
                # so prefer a same-weight row without excluding the others.
                query = base.where(func.lower(Filament.series) == series.lower())
                if weight is not None:
                    query = query.order_by(
                        (Filament.spool_weight_g == weight).desc(),
                        col(Filament.created_at).asc(),
                    )
                else:
                    query = query.order_by(col(Filament.created_at).asc())
                filament = session.exec(query).first()
                if not filament:
                    # Adopt a pre-series row and backfill it rather than
                    # splitting the same product into a duplicate. Do not
                    # guess when the colour group names several products.
                    known_series = catalog_series_for(brand, material, color)
                    if len(known_series) <= 1:
                        query = base.where(col(Filament.series).is_(None))
                        if weight is not None:
                            query = query.order_by(
                                (Filament.spool_weight_g == weight).desc(),
                                col(Filament.created_at).asc(),
                            )
                        else:
                            query = query.order_by(col(Filament.created_at).asc())
                        filament = session.exec(query).first()
                        if filament:
                            filament.series = series
                            session.add(filament)
            else:
                # A tray with no series cannot identify which product a
                # legacy row belongs to in an ambiguous colour group.
                known_series = catalog_series_for(brand, material, color)
                if len(known_series) <= 1:
                    query = base.where(col(Filament.series).is_(None))
                    if weight is not None:
                        query = query.order_by(
                            (Filament.spool_weight_g == weight).desc(),
                            col(Filament.created_at).asc(),
                        )
                    else:
                        query = query.order_by(col(Filament.created_at).asc())
                    filament = session.exec(query).first()
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
            series=series or None,
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
        remain_pct: float | None,
        printer_id: uuid.UUID,
    ) -> Spool | None:
        """Return an untagged spool whose weight matches the AMS estimate.

        FIFO decides between equally plausible spools. A tray whose estimate is
        unknown never adopts anything, and a partial tray never adopts a full
        spool, because the weight difference is too large.
        """
        if remain_pct is None:
            return None
        candidates = session.exec(
            select(Spool)
            .where(
                Spool.filament_id == filament_id,
                col(Spool.tag_uid).is_(None),
                # A spool already assigned to this printer is still a valid
                # candidate; a spool on another printer is not.
                or_(
                    col(Spool.printer_id).is_(None),
                    Spool.printer_id == printer_id,
                ),
                col(Spool.remaining_unknown).is_(False),
            )
            .order_by(col(Spool.created_at).asc(), col(Spool.id).asc())
        ).all()
        best: Spool | None = None
        best_delta: float | None = None
        for candidate in candidates:
            if candidate.total_weight_g <= 0:
                continue
            candidate_pct = candidate.remaining_g / candidate.total_weight_g * 100
            delta = abs(candidate_pct - remain_pct)
            if delta <= 15.0 and (best_delta is None or delta < best_delta):
                best = candidate
                best_delta = delta
        return best

    def _sync_ams_trays(self, ams: dict, signature: str) -> bool:
        if not self.serial:
            return False
        with self._ams_lock:
            ok = self._sync_ams_trays_inner(ams)
        if ok:
            self._ams_failures = 0
            self._ams_retry_after = 0.0
        elif self._ams_signature == signature:
            # Let the next identical report retry, but back off so a permanent
            # failure does not hit the database every two seconds.
            self._ams_failures += 1
            delay = min(300.0, 30.0 * (2 ** (self._ams_failures - 1)))
            self._ams_retry_after = time.time() + delay
            self._ams_signature = None
        return ok

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
                    remain_pct = self._tray_remain_percent(tray)
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
                            session, filament.id, remain_pct, printer.id
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
            retries = 0
            while not task and retries < TASK_LOOKUP_RETRIES:
                time.sleep(TASK_LOOKUP_DELAY)
                retries += 1
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

            if not task or task.get("status") != 4:
                logger.warning("Task %s never reached the printing state", task_id)
                return
            if trys >= maxTrys:
                # The 30th poll may be the one that reported status 4.
                logger.info("Task %s reached printing on the last poll", task_id)

            cloud_task_id = str(task.get("id"))
            self._remember_started_task(cloud_task_id)
            if task_id and cloud_task_id != task_id:
                logger.warning(
                    "Cloud returned task %s instead of %s; skipping job",
                    cloud_task_id,
                    task_id,
                )
                return

            with Session(engine) as session:
                active_spool = self._active_spool(session)
                title = (
                    task.get("title")
                    or self._current_status.get("subtask_name")
                    or "Unknown"
                )

                # A FAILED -> RUNNING retry reports the same task again. Let
                # the unique key decide; never insert a second row.
                session.execute(
                    pg_insert(PrintJob)
                    .values(
                        id=uuid.uuid4(),
                        spool_id=active_spool.id if active_spool else None,
                        filament_id=(
                            active_spool.filament_id if active_spool else None
                        ),
                        title=title,
                        cover=task.get("cover"),
                        weight=task.get("weight"),
                        duration_seconds=task.get("costTime"),
                        start_time=parse_task_datetime(task.get("startTime")),
                        status=task.get("status"),
                        bambu_task_id=cloud_task_id,
                        device_id=self.serial,
                        ams_detail_mapping=json.dumps(task.get("amsDetailMapping", [])),
                    )
                    .on_conflict_do_nothing(
                        index_elements=["device_id", "bambu_task_id"]
                    )
                )

                # A FAILED -> RUNNING retry reuses the row; it must not
                # inherit the previous finish countdown.
                session.execute(
                    update(PrintJob)
                    .where(PrintJob.device_id == self.serial)
                    .where(PrintJob.bambu_task_id == cloud_task_id)
                    .values(
                        status=4,
                        finished_at=None,
                        finish_requested_at=None,
                        finish_attempts=0,
                        finish_state=None,
                    )
                )
                session.commit()
                logger.info("PrintJob saved: %s — %sg used", title, task.get("weight"))

        except Exception as e:
            logger.error(f"Failed to save print job: {e}")

    def _save_print_job(
        self,
        task_id: str | None = None,
        observed_state: str | None = None,
        task: dict | None = None,
    ) -> None:
        """Update an existing PrintJob and deduct filament once."""
        try:
            if self._current_status.get("gcode_state") == "RUNNING":
                logger.info(
                    "Ignoring finish for task %s while the printer is running",
                    task_id,
                )
                return
            if task is None:
                task = self._fetch_cloud_task(task_id)
            retries = 0
            while not task and retries < TASK_LOOKUP_RETRIES:
                time.sleep(TASK_LOOKUP_DELAY)
                retries += 1
                task = self._fetch_cloud_task(task_id)
            if not task:
                # The task list lags the printer. Closing the row now would
                # mark it finished with no weight, mapping or deduction.
                if task_id and self._was_started(task_id):
                    # The start was observed but its row insert was lost.
                    # Keep an open row so a later pass can still finish it.
                    self._ensure_open_placeholder(task_id)
                logger.warning(
                    "No cloud task for %s yet; leaving the job open for a retry",
                    task_id,
                )
                self._defer_finish(task_id, observed_state)
                return

            mapping = task.get("amsDetailMapping") or []
            if mapping and not self._current_status.get("ams"):
                # Slot-to-spool resolution needs the tray tags. A bare
                # connect has no AMS state yet, and the tagless fallback
                # would charge an untagged roll.
                self._reconcile_on_ams = True
                logger.warning(
                    "Task %s has an AMS mapping but no AMS state yet; "
                    "finish deferred until the first report",
                    task_id,
                )
                resolved_id = task.get("id")
                self._defer_finish(
                    str(resolved_id) if resolved_id is not None else task_id,
                    observed_state,
                )
                return

            fallback_status = (
                2
                if observed_state == "FINISH"
                else 3
                if observed_state == "FAILED"
                else None
            )
            timed_out = False

            logger.info("Print finished — waiting for cloud to catch up...")

            trys = 0
            maxTrys = 30
            while task.get("status") == 4 and trys < maxTrys:
                time.sleep(1)
                trys += 1
                task = self._fetch_cloud_task(task_id)
                if not task:
                    logger.warning(
                        "Cloud task %s disappeared while waiting; leaving the job open",
                        task_id,
                    )
                    self._defer_finish(task_id, observed_state)
                    return

            if task.get("status") == 4:
                if fallback_status is None:
                    logger.warning(
                        "Task %s was still printing when polling stopped", task_id
                    )
                    return
                # The cloud is slow. Persist the printer's final state so the
                # print does not stay active forever, but do not claim the
                # deduction from a payload whose per-slot weights are still
                # partial.
                logger.warning(
                    "Task %s was still printing when polling stopped; "
                    "using printer state %s",
                    task_id,
                    observed_state,
                )
                timed_out = True
                task = {**task, "status": fallback_status}

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

                job = session.exec(
                    select(PrintJob)
                    .where(PrintJob.device_id == self.serial)
                    .where(PrintJob.bambu_task_id == cloud_task_id)
                ).first()

                if not job:
                    if not self._was_started(cloud_task_id):
                        # A bare None -> FINISH after a restart (or after the
                        # user deleted the print) must not create a phantom,
                        # fully-deducted job.
                        logger.warning(
                            "No open print job for task %s; finish ignored",
                            cloud_task_id,
                        )
                        return
                    # The start was observed but its row insert was lost.
                    # Recover the row and deduct normally.
                    logger.info(
                        "Recovering the missing start row for task %s",
                        cloud_task_id,
                    )
                    session.execute(
                        pg_insert(PrintJob)
                        .values(
                            id=uuid.uuid4(),
                            title=task.get("title") or "Unknown",
                            bambu_task_id=cloud_task_id,
                            device_id=self.serial or "",
                        )
                        .on_conflict_do_nothing(
                            index_elements=["device_id", "bambu_task_id"]
                        )
                    )
                    job = session.exec(
                        select(PrintJob)
                        .where(PrintJob.device_id == self.serial)
                        .where(PrintJob.bambu_task_id == cloud_task_id)
                    ).one()

                job.title = task.get("title") or job.title or "Unknown"
                if task.get("cover") is not None:
                    job.cover = task.get("cover")
                if task.get("weight") is not None:
                    job.weight = task.get("weight")
                if task.get("costTime") is not None:
                    job.duration_seconds = task.get("costTime")
                job.start_time = (
                    parse_task_datetime(task.get("startTime")) or job.start_time
                )
                job.finished_at = parse_task_datetime(task.get("endTime")) or (
                    datetime.now(UTC) if timed_out else job.finished_at
                )
                if task.get("status") is not None:
                    job.status = task.get("status")
                mapping = task.get("amsDetailMapping")
                if mapping:
                    job.ams_detail_mapping = json.dumps(mapping)
                job.finish_requested_at = None
                job.finish_attempts = 0
                job.finish_state = None

                # Keep the spool and filament written at start; AMS slots
                # already charged their own spools. Only fill blanks.
                if job.spool_id is None and active_spool:
                    job.spool_id = active_spool.id
                if job.filament_id is None and active_spool:
                    job.filament_id = active_spool.filament_id

                if task.get("weight") and job.filament_id:
                    recent_spools = session.exec(
                        select(Spool)
                        .where(Spool.filament_id == job.filament_id)
                        .where(Spool.price_per_kg.is_not(None))
                        .order_by(desc(Spool.created_at))
                        .limit(5)
                    ).all()

                    prices = [
                        s.price_per_kg
                        for s in recent_spools
                        if s.price_per_kg and s.price_per_kg > 0
                    ]
                    if prices:
                        avg_price = sum(prices) / len(prices)
                        estimated_cost = round((task["weight"] / 1000) * avg_price, 2)
                        job.estimated_cost = estimated_cost
                        logger.info(
                            f"Estimated cost: €{estimated_cost} (avg €{avg_price}/kg)"
                        )

                job.bambu_task_id = cloud_task_id
                job.device_id = self.serial
                session.add(job)

                can_deduct = not timed_out
                if can_deduct and mapping:
                    ams = self._current_status.get("ams")
                    if not ams or not self._sync_ams_trays(
                        ams, self._ams_signature_for(ams)
                    ):
                        can_deduct = False
                        logger.warning(
                            "AMS sync did not complete for task %s; leaving "
                            "the deduction for a retry",
                            cloud_task_id,
                        )

                if not can_deduct:
                    logger.warning(
                        "Left the filament deduction for task %s unclaimed",
                        cloud_task_id,
                    )
                elif self._claim_filament_deduction(session, job.id):
                    self._deduct_filament_from_spools(session, task)
                else:
                    logger.info(
                        "Skipped deduction for task %s: already claimed",
                        cloud_task_id,
                    )

                session.commit()
                logger.info(
                    "PrintJob saved: %s — %sg used",
                    job.title,
                    task.get("weight"),
                )

        except Exception as e:
            logger.error(f"Failed to save print job: {e}")

    def _claim_filament_deduction(self, session: Session, job_id: uuid.UUID) -> bool:
        """Atomically claim the single filament deduction for a job."""
        result = session.execute(
            update(PrintJob)
            .where(
                PrintJob.id == job_id,
                PrintJob.filament_deducted_at.is_(None),
            )
            .values(filament_deducted_at=datetime.now(UTC))
        )
        return result.rowcount == 1

    def _spool_for_ams_slot(
        self,
        session: Session,
        printer_id: uuid.UUID | None,
        slot: dict,
        used_spool_ids: set[uuid.UUID],
        filament_id: str | None,
        filament_type: str | None,
    ) -> Spool | None:
        """Resolve an AMS mapping entry to the spool loaded in that tray."""
        ams_id = slot.get("amsId")
        if ams_id is None:
            ams_id = slot.get("ams")
        slot_id = slot.get("slotId")
        if slot_id is None:
            slot_id = slot.get("slot")

        untagged_tray = False
        ams_block = self._current_status.get("ams") or {}
        # The real MQTT payload nests the units under ``ams.ams``; the flat
        # list form is kept for older callers and tests.
        units = ams_block.get("ams", []) if isinstance(ams_block, dict) else ams_block
        if ams_id is not None and slot_id is not None:
            for unit in units or []:
                try:
                    unit_id = int(unit.get("id"))
                    ams_id_wanted = int(ams_id)
                    slot_id_wanted = int(slot_id)
                except (TypeError, ValueError):
                    continue
                if unit_id != ams_id_wanted:
                    continue
                for tray in unit.get("tray", []) or []:
                    try:
                        tray_id = int(tray.get("id"))
                    except (TypeError, ValueError):
                        continue
                    if tray_id != slot_id_wanted:
                        continue
                    tag = self._real_tag(tray.get("tag_uid"))
                    if tag:
                        spool = session.exec(
                            select(Spool).where(Spool.tag_uid == tag)
                        ).first()
                        if spool and spool.id not in used_spool_ids:
                            return spool
                        # A tagged tray names one physical roll. If it is
                        # missing or already claimed, do not charge another.
                        return None
                    untagged_tray = True
                    break

        if printer_id:
            query = (
                select(Spool)
                .join(Filament, Spool.filament_id == Filament.id)
                .where(Spool.printer_id == printer_id)
                .where(col(Spool.remaining_unknown).is_(False))
                .where(col(Spool.tag_uid).is_(None))
                .order_by(
                    col(Spool.active).desc(),
                    col(Spool.created_at).asc(),
                )
            )
            if used_spool_ids:
                query = query.where(col(Spool.id).not_in(used_spool_ids))
            if filament_id:
                # Match every colour that shares this preset, not one filament.
                query = query.where(Filament.bambu_info_idx == filament_id)
            elif filament_type:
                query = query.where(
                    func.lower(Filament.material) == filament_type.lower()
                )
            spool = session.exec(query).first()
            if spool:
                return spool
            if filament_id or filament_type:
                # The slot names a filament; do not charge an unrelated roll.
                return None

        active_spool = self._active_spool(session)
        if (
            active_spool
            and active_spool.id not in used_spool_ids
            and not active_spool.remaining_unknown
        ):
            if untagged_tray and self._real_tag(active_spool.tag_uid):
                return None
            if not (filament_id or filament_type):
                return active_spool
            filament = (
                session.get(Filament, active_spool.filament_id)
                if active_spool.filament_id
                else None
            )
            if filament and (
                (filament_id and filament.bambu_info_idx == filament_id)
                or (
                    not filament_id
                    and filament_type
                    and filament.material.lower() == filament_type.lower()
                )
            ):
                return active_spool
        return None

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

        used_spool_ids: set[uuid.UUID] = set()
        resolved_by_slot: dict[tuple[int, int], Spool] = {}
        for slot in ams_mapping:
            used_g = slot.get("weight", 0)
            if not used_g:
                continue

            filament_id = slot.get("filamentId")  # e.g. "GFL99"
            filament_type = slot.get("filamentType")  # e.g. "PLA"

            ams_id = slot.get("amsId")
            if ams_id is None:
                ams_id = slot.get("ams")
            slot_id = slot.get("slotId")
            if slot_id is None:
                slot_id = slot.get("slot")
            try:
                slot_key = (int(ams_id), int(slot_id))
            except (TypeError, ValueError):
                slot_key = None

            spool = resolved_by_slot.get(slot_key) if slot_key else None
            if spool is None:
                spool = self._spool_for_ams_slot(
                    session,
                    printer_id,
                    slot,
                    used_spool_ids,
                    filament_id,
                    filament_type,
                )
                if spool and slot_key:
                    resolved_by_slot[slot_key] = spool
            if not spool:
                logger.warning(
                    "No matching spool for slot %s (%s); skipped %sg",
                    slot,
                    filament_type,
                    used_g,
                )
                continue

            used_spool_ids.add(spool.id)
            if spool.remaining_unknown:
                logger.info(
                    "Skipped %sg deduction: spool %s has unknown weight",
                    used_g,
                    spool.id,
                )
                continue
            spool.remaining_g = max(0, spool.remaining_g - used_g)
            spool.last_used_at = datetime.now(UTC)
            logger.info(f"Deducted {used_g}g ({filament_type}) from spool {spool.id}")

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

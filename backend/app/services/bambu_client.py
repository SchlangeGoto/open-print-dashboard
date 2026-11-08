import json
import logging
import ssl
import threading
import time
import uuid
from datetime import UTC, datetime

import paho.mqtt.client as mqtt
from sqlalchemy import func
from sqlmodel import Session, col, desc, select

from app.core.commands import GET_VERSION, PUSH_ALL, START_PUSH
from app.core.db import engine
from app.models import Filament, Printer, PrintJob, Spool
from app.services.bambu_catalog import BAMBU_COLOR_NAMES

logger = logging.getLogger("uvicorn.error")

WATCHDOG_TIMER = 60


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
                    keepalive=5,
                )
                last_exception = ""
                self._client.client.loop_forever()
                logger.debug("loop_forever exited cleanly")
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
        self.access_code: str | None = None

        self._connected = False
        self._current_status: dict = {}
        self._ams_signature: str | None = None
        self._last_ams_sync = 0.0

        self.client: mqtt.Client | None = None
        self._mqtt_thread: MqttThread | None = None
        self._watchdog: WatchdogThread | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self.host and self.serial and self.access_code)

    def configure(
        self, host: str | None, serial: str | None, access_code: str | None
    ) -> None:
        """Set the connection parameters and reset the cached status."""
        self.host = host
        self.serial = serial
        self.access_code = access_code
        self._connected = False
        self._current_status = {}
        self._ams_signature = None
        self._last_ams_sync = 0.0

    def connect(self) -> None:
        """Set up the MQTT client and start the background thread."""
        if not self.is_configured:
            logger.info("Printer is not configured yet — skipping MQTT connection")
            return

        self.client = mqtt.Client(
            client_id=f"open-print-{uuid.uuid4()}",
            protocol=mqtt.MQTTv311,
            clean_session=True,
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        )

        # TLS — skip cert verification
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        self.client.tls_set_context(context)

        self.client.username_pw_set("bblp", password=self.access_code)
        self.client.reconnect_delay_set(min_delay=1, max_delay=1)

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        self._mqtt_thread = MqttThread(self)
        self._mqtt_thread.start()
        logger.info(f"MQTT thread started for {self.host}")

    def disconnect(self) -> None:
        """Stop all threads and disconnect cleanly."""
        if self._mqtt_thread:
            self._mqtt_thread.stop()
            self._mqtt_thread.join(timeout=5)
            self._mqtt_thread = None

        if self._watchdog:
            self._watchdog.stop()
            self._watchdog.join(timeout=5)
            self._watchdog = None

        if self.client:
            try:
                self.client.loop_stop()
                self.client.disconnect()
            except Exception as e:
                logger.debug(f"Error during disconnect: {e}")
            finally:
                self.client = None

        self._connected = False
        logger.info("Disconnected from printer")

    def _on_connect(self, client, userdata, flags, rc, properties=None) -> None:
        if rc == 0:
            logger.info(f"Connected to printer at {self.host}")
            self._connected = True
            client.subscribe(f"device/{self.serial}/report")
            self._publish(GET_VERSION)
            self._publish(PUSH_ALL)
            self._watchdog = WatchdogThread(self)
            self._watchdog.start()
        else:
            codes = {
                1: "wrong protocol",
                2: "invalid client id",
                3: "server unavailable",
                4: "bad credentials",
                5: "not authorised",
            }
            logger.error(f"Connection failed: {codes.get(rc, rc)}")

    def _on_disconnect(
        self, client, userdata, rc, properties=None, reason_code=None
    ) -> None:
        self._connected = False
        if self._watchdog:
            self._watchdog.stop()
            self._watchdog.join(timeout=5)
            self._watchdog = None

        if rc == 0:
            logger.info("Disconnected cleanly")
        else:
            logger.warning(f"Disconnected unexpectedly (rc={rc})")

    def _on_message(self, client, userdata, message) -> None:
        try:
            if self.client is None:
                return
            data = json.loads(message.payload)

            # Tell watchdog we got data
            if self._watchdog:
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

    def _handle_print_update(self, print_data: dict) -> None:
        """Merge incoming print data into current status."""
        command = print_data.get("command")
        logger.debug(f"Print update: command={command}")

        old_state = self._current_status.get("gcode_state")
        self._current_status.update(print_data)
        new_state = self._current_status.get("gcode_state")

        ams = self._current_status.get("ams")
        if ams:
            signature = json.dumps(ams, sort_keys=True)
            now = time.time()
            if signature != self._ams_signature and now - self._last_ams_sync > 2:
                self._ams_signature = signature
                self._last_ams_sync = now
                threading.Thread(
                    target=self._sync_ams_trays, args=(ams,), daemon=True
                ).start()

        if (
            old_state in ("IDLE", "FINISH", "FAILED", "PREPARE")
            and new_state == "RUNNING"
        ):
            logger.info("Print started")
            self._on_print_started()

        if old_state == "RUNNING" and new_state in ("FINISH", "FAILED"):
            logger.info(f"Print finished with state: {new_state}")
            self._on_print_finished(new_state)

    def _on_print_finished(self, state: str) -> None:
        """Called when a print completes or fails."""
        t = threading.Thread(target=self._save_print_job, daemon=True)
        t.start()

    def _on_print_started(self) -> None:
        t = threading.Thread(target=self._save_print_job_init, daemon=True)
        t.start()

    def _active_spool(self, session: Session) -> Spool | None:
        """Return the spool loaded in this printer, not another printer."""
        if not self.serial:
            return None
        printer = session.exec(
            select(Printer).where(Printer.serial == self.serial)
        ).first()
        if not printer:
            return None
        return session.exec(select(Spool).where(Spool.printer_id == printer.id)).first()

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
    def _tray_remaining(tray: dict, total: float) -> float:
        try:
            remain = float(tray.get("remain") or 0)
        except (TypeError, ValueError):
            remain = 0
        if remain <= 0:
            return total
        return max(0.0, min(total, total * remain / 100))

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

        filament = session.exec(
            select(Filament).where(
                Filament.bambu_info_idx == info_idx,
                func.lower(Filament.color_hex) == (color or "").lower(),
            )
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

    def _sync_ams_trays(self, ams: dict) -> None:
        """Create and update spools from AMS trays reported by the printer."""
        if not self.serial:
            return
        try:
            with Session(engine) as session:
                printer = session.exec(
                    select(Printer).where(Printer.serial == self.serial)
                ).first()
                if not printer:
                    return

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
                        # If exactly one barcode-created spool of this
                        # filament has no RFID tag yet, this is almost
                        # certainly the physical spool that was just scanned.
                        # Link the tag instead of creating a duplicate.
                        candidates = session.exec(
                            select(Spool)
                            .where(
                                Spool.filament_id == filament.id,
                                col(Spool.tag_uid).is_(None),
                                Spool.source == "barcode",
                            )
                            .order_by(col(Spool.created_at).desc())
                        ).all()
                        if len(candidates) == 1:
                            spool = candidates[0]
                            spool.tag_uid = tag
                            spool.total_weight_g = total
                            spool.remaining_g = remaining
                            session.add(spool)
                        else:
                            spool = Spool(
                                filament_id=filament.id,
                                total_weight_g=total,
                                remaining_g=remaining,
                                tag_uid=tag,
                                source="ams",
                            )
                            session.add(spool)
                        session.flush()
                    else:
                        spool.remaining_g = remaining
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
                    active_spool.active = True
                    active_spool.printer_id = printer.id

                session.commit()
                if active_spool:
                    logger.info(
                        "AMS synced %s trays; active spool %s",
                        len(trays),
                        active_spool.id,
                    )
        except Exception as exc:
            logger.error("AMS sync failed: %s", exc)

    def _save_print_job_init(self) -> None:
        """Fetch cloud data and save a PrintJob when a print starts."""
        from app.services.printer_service import printer_service

        try:
            task = printer_service.cloud_client.get_latest_task_for_printer(self.serial)
            if not task:
                logger.warning("No cloud task found on print start")
                return

            trys = 0
            maxTrys = 30
            while task.get("status") != 4 and trys < maxTrys:
                time.sleep(1)
                trys += 1
                task = printer_service.cloud_client.get_latest_task_for_printer(
                    self.serial
                )
                if not task:
                    break

            if trys >= maxTrys:
                logger.error(f"Failed to fetch cloud task after {maxTrys} tries")
                return

            with Session(engine) as session:
                active_spool = self._active_spool(session)

                job = PrintJob(
                    spool_id=active_spool.id if active_spool else None,
                    title=task.get(
                        "title", self._current_status.get("subtask_name", "Unknown")
                    ),
                    cover=task.get("cover"),
                    weight=task.get("weight"),
                    duration_seconds=task.get("costTime"),
                    start_time=task.get("startTime"),
                    status=task.get("status"),
                    bambu_task_id=str(task.get("id")),
                    device_id=self.serial,
                    ams_detail_mapping=str(task.get("amsDetailMapping", [])),
                )
                session.add(job)
                session.commit()
                logger.info(f"PrintJob saved: {job.title} — {task.get('weight')}g used")

        except Exception as e:
            logger.error(f"Failed to save print job: {e}")

    def _save_print_job(self) -> None:
        """Update the PrintJob and deduct filament when a print finishes."""
        from app.services.printer_service import printer_service

        try:
            task = printer_service.cloud_client.get_latest_task_for_printer(self.serial)

            if not task:
                logger.warning("No cloud task found after print finished")
                return

            logger.info("Print finished — waiting for cloud to catch up...")

            trys = 0
            maxTrys = 30
            while task.get("status") == 4 and trys < maxTrys:
                time.sleep(1)
                trys += 1
                task = printer_service.cloud_client.get_latest_task_for_printer(
                    self.serial
                )
                if not task:
                    break

            if trys >= maxTrys:
                logger.error(f"Failed to fetch cloud task after {maxTrys} tries")
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
                    select(PrintJob).where(
                        PrintJob.bambu_task_id == str(task.get("id"))
                    )
                ).first()

                if not job:
                    job = PrintJob(
                        bambu_task_id=str(task.get("id")),
                        device_id=self.serial or "",
                    )
                    session.add(job)

                job.spool_id = active_spool.id if active_spool else None
                job.title = task.get("title")
                job.cover = task.get("cover")
                job.weight = task.get("weight")
                job.estimated_cost = estimated_cost
                job.duration_seconds = task.get("costTime")
                job.start_time = task.get("startTime")
                job.finished_at = task.get("endTime")
                job.status = task.get("status")
                job.bambu_task_id = str(task.get("id"))
                job.device_id = self.serial
                job.ams_detail_mapping = str(task.get("amsDetailMapping", []))

                session.add(job)

                self._deduct_filament_from_spools(session, task)

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
            if active_spool and task.get("weight"):
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

            if spool:
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
        """Return the latest known printer status."""
        if not self._current_status:
            return {"connected": self._connected, "status": "no_data"}
        return {**self._current_status, "connected": self._connected}

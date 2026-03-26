import json
import ssl
import threading
import time
import uuid

import logging

from datetime import datetime, timezone

from sqlmodel import desc

from app.core.commands import *
from app.core.config import config
import paho.mqtt.client as mqtt
from sqlmodel import Session, select

from app.db.database import engine
from app.db.models import PrintJob, Spool, Filament

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

    def stop(self):
        self._stop_event.set()

    def received_data(self):
        self._last_received_data = time.time()

    def run(self):
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

    def stop(self):
        self._stop_event.set()

    def run(self):
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
    def __init__(self):
        self.host = config.printer_ip
        self.port = 8883
        self.serial = config.printer_serial
        self.access_code = config.printer_access_code

        self._connected =False
        self._current_status: dict = {}

        self.client: mqtt.Client | None = None
        self._mqtt_thread: MqttThread | None = None
        self._watchdog: WatchdogThread | None = None

    def connect(self):
        """Set up the MQTT client and start the background thread."""
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

    def disconnect(self):
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


    def _on_connect(self, client, userdata, flags, rc, properties=None):
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

    def _on_disconnect(self, client, userdata, rc, properties=None, reason_code=None):
        self._connected = False
        if self._watchdog:
            self._watchdog.stop()
            self._watchdog.join(timeout=5)
            self._watchdog = None

        if rc == 0:
            logger.info("Disconnected cleanly")
        else:
            logger.warning(f"Disconnected unexpectedly (rc={rc})")

    def _on_message(self, client, userdata, message):
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

    def _handle_print_update(self, print_data: dict):
        """Merge incoming print data into current status."""
        command = print_data.get("command")
        logger.debug(f"Print update: command={command}")

        old_state = self._current_status.get("gcode_state")
        logger.debug(f"Old state: {old_state}")
        self._current_status.update(print_data)
        new_state = self._current_status.get("gcode_state")
        logger.debug(f"New state: {new_state}")

        if old_state in ("IDLE", "FINISH", "FAILED", "PREPARE") and new_state == "RUNNING":
            logger.info(f"Print started")
            self._on_print_started()

        if old_state == "RUNNING" and new_state in ("FINISH", "FAILED"):
            logger.info(f"Print finished with state: {new_state}")
            self._on_print_finished(new_state)

    def _on_print_finished(self, state: str):
        """Called when a print completes or fails."""
        t = threading.Thread(target=self._save_print_job, daemon=True)
        t.start()

    def _on_print_started(self):
        t = threading.Thread(target=self._save_print_job_init, daemon=True)
        t.start()

    def _save_print_job_init(self):
        from app.services.printer_service import printer_service
        """Fetch cloud data and save PrintJob + deduct from spool."""
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
                task = printer_service.cloud_client.get_latest_task_for_printer(self.serial)
                if not task:
                    break

            if trys >= maxTrys:
                logger.error(f"Failed to fetch cloud task after {maxTrys} tries")
                return

            with Session(engine) as session:
                active_spool = session.exec(
                    select(Spool).where(Spool.active == True)
                ).first()

                # save print job
                job = PrintJob(
                    spool_id=active_spool.id if active_spool else None,
                    title=task.get("title", self._current_status.get("subtask_name", "Unknown")),
                    cover=task.get("cover"),
                    weight=task.get("weight"), # Grams
                    duration_seconds=task.get("costTime"), # Seconds
                    start_time=task.get("startTime"), # weird ISO 8601 notation
                    status=task.get("status"), # even weirder, its an int: 4 == "RUNNING", 3 == "CANCElED (maybe also "FAILED"??), 2 == "FINISHED", 1 == ??? (maybe FAILED)"
                    bambu_task_id=str(task.get("id")),
                    device_id=self.serial,
                    ams_detail_mapping=str(task.get("amsDetailMapping", [])),
                )
                session.add(job)

                session.commit()
                logger.info(f"PrintJob saved: {job.title} — {task.get('weight')}g used")

        except Exception as e:
            logger.error(f"Failed to save print job: {e}")

    def _save_print_job(self):
        from app.services.printer_service import printer_service

        """Fetch cloud data and save PrintJob + deduct from spool."""

        try:
            # fetch latest task from cloud
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
                task = printer_service.cloud_client.get_latest_task_for_printer(self.serial)
                if not task:
                    break

            if trys >= maxTrys:
                logger.error(f"Failed to fetch cloud task after {maxTrys} tries")
                return


            with Session(engine) as session:
                # find active spool
                active_spool = session.exec(
                    select(Spool).where(Spool.active == True)
                ).first()

                estimated_cost = None
                if active_spool and task.get("weight"):
                    # get average price from last 5 spools of same filament
                    recent_spools = session.exec(
                        select(Spool)
                        .where(Spool.filament_id == active_spool.filament_id)
                        .where(Spool.price_per_kg != None)
                        .order_by(desc(Spool.created_at))
                        .limit(5)
                    ).all()

                    if recent_spools:
                        avg_price = sum(s.price_per_kg for s in recent_spools) / len(recent_spools)
                        estimated_cost = round((task["weight"] / 1000) * avg_price, 2)
                        logger.info(f"Estimated cost: €{estimated_cost} (avg €{avg_price}/kg)")

                # save print job
                job = session.exec(select(PrintJob).where(PrintJob.bambu_task_id == str(task.get("id")))).first()

                if not job:
                    # init was missed — create fresh
                    job = PrintJob(
                        bambu_task_id=str(task.get("id")),
                        device_id=self.serial,
                    )
                    session.add(job)

                job.spool_id=active_spool.id if active_spool else None
                job.title=task.get("title")
                job.cover=task.get("cover")
                job.weight=task.get("weight")
                job.estimated_cost=estimated_cost
                job.duration_seconds=task.get("costTime")
                job.start_time=task.get("startTime")
                job.finished_at=task.get("endTime")
                job.status=task.get("status")
                job.bambu_task_id=str(task.get("id"))
                job.device_id=self.serial
                job.ams_detail_mapping=str(task.get("amsDetailMapping", []))

                session.add(job)

                self._deduct_filament_from_spools(session, task)

                session.commit()
                logger.info(f"PrintJob saved: {job.title} — {task.get('weight')}g used")

        except Exception as e:
            logger.error(f"Failed to save print job: {e}")

    def _deduct_filament_from_spools(self, session, task: dict):
        """
        Deduct filament usage per color slot from the correct spools.
        Falls back to deducting from active spool if mapping unavailable.
        """
        ams_mapping = task.get("amsDetailMapping", [])

        if not ams_mapping:
            active_spool = session.exec(
                select(Spool).where(Spool.active == True)
            ).first()
            if active_spool and task.get("weight"):
                active_spool.remaining_g = max(0, active_spool.remaining_g - task["weight"])
                active_spool.last_used_at = datetime.now(timezone.utc)
                logger.info(f"Deducted {task['weight']}g from active spool {active_spool.id}")
            return

        for slot in ams_mapping:
            used_g = slot.get("weight", 0)
            if not used_g:
                continue

            filament_id = slot.get("filamentId")  # e.g. "GFL99"
            filament_type = slot.get("filamentType")  # e.g. "PLA"

            spool = session.exec(
                select(Spool)
                .join(Filament, Spool.filament_id == Filament.id)
                .where(Filament.bambu_info_idx == filament_id)
                .where(Spool.active == True)
            ).first()

            if not spool:
                spool = session.exec(
                    select(Spool).where(Spool.active == True)
                ).first()

            if spool:
                spool.remaining_g = max(0, spool.remaining_g - used_g)
                spool.last_used_at = datetime.now(timezone.utc)
                logger.info(f"Deducted {used_g}g ({filament_type}) from spool {spool.id}")

    def _handle_info_update(self, info_data: dict):
        """Handle firmware version info."""
        command = info_data.get("command")
        logger.debug(f"Info update: command={command}")
        if command == "get_version":
            modules = info_data.get("module", [])
            for m in modules:
                if m.get("name") == "ota":
                    logger.info(f"Firmware version: {m.get('sw_ver')}")

    def _handle_event(self, event_data: dict):
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

        return self._current_status


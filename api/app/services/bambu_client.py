import json
import ssl
import threading
import time
import uuid

import logging

from datetime import datetime, timezone
from app.core.commands import *
from app.core.config import config
import paho.mqtt.client as mqtt
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

        except Exception as e:
            logger.error(f"Error processing message: {e}")

    def _handle_print_update(self, print_data: dict):
        """Merge incoming print data into current status."""
        command = print_data.get("command")
        logger.debug(f"Print update: command={command}")

        old_state = self._current_status.get("gcode_state")
        self._current_status.update(print_data)
        new_state = self._current_status.get("gcode_state")

        if old_state == "RUNNING" and new_state in ("FINISH", "FAILED"):
            logger.info(f"Print finished with state: {new_state}")
            self._on_print_finished(new_state)
        # Merge — printer only sends changed fields on P1/A1 series
        self._current_status.update(print_data)

    def _on_print_finished(self, state: str):
        """Called when a print completes or fails."""
        import threading
        t = threading.Thread(target=self._save_print_job, args=(state,), daemon=True)
        t.start()

    def _save_print_job(self, state: str):
        """Fetch cloud data and save PrintJob + deduct from spool."""
        import time
        from sqlmodel import Session, select
        from app.db.database import engine
        from app.db.models import PrintJob, Spool
        from app.services.printer_service import printer_service

        logger.info("Print finished — waiting 30s for cloud to catch up...")
        time.sleep(30)  # give Bambu cloud time to register the completed task

        try:
            # fetch latest task from cloud
            task = printer_service.cloud_client.get_latest_task_for_printer(self.serial)

            if not task:
                logger.warning("No cloud task found after print finished")
                return

            with Session(engine) as session:
                # find active spool
                active_spool = session.exec(
                    select(Spool).where(Spool.active == True)
                ).first()


                # save print job
                job = PrintJob(
                    spool_id=active_spool.id if active_spool else None,
                    title=task.get("title"),
                    cover=task.get("cover"),
                    weight=task.get("weight"),
                    duration_seconds=task.get("costTime"),
                    start_time=task.get("startTime"),
                    finished_at=task.get("endTime"),
                    status=task.get("status"),
                    bambu_task_id=str(task.get("id")),
                    device_id=self.serial,
                    ams_detail_mapping=str(task.get("amsDetailMapping", [])),
                )
                session.add(job)

                # deduct from active spool
                if active_spool and task.get("weight"):
                    active_spool.remaining_g = max(0, active_spool.remaining_g - task["weight"])
                    active_spool.last_used_at = datetime.now(timezone.utc)
                    logger.info(
                        f"Deducted {task['weight']}g from spool {active_spool.id} — {active_spool.remaining_g}g remaining")

                session.commit()
                logger.info(f"PrintJob saved: {job.title} — {task.get('weight')}g used")

        except Exception as e:
            logger.error(f"Failed to save print job: {e}")

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

        s = self._current_status

        # ── AMS ───────────────────────────────────────────────────────────────
        ams_raw = s.get("ams", {})
        ams_units = ams_raw.get("ams", [])

        trays = []
        for ams_unit in ams_units:
            for tray in ams_unit.get("tray", []):
                if "tray_type" not in tray:
                    continue
                color_hex = tray.get("tray_color", "")
                trays.append({
                    "ams_id": ams_unit.get("id"),
                    "tray_id": tray.get("id"),
                    "type": tray.get("tray_type"),
                    "color": f"#{color_hex[:6]}" if len(color_hex) >= 6 else None,
                    "color_full": color_hex,
                    "brand": tray.get("tray_sub_brands"),
                    "name": tray.get("tray_id_name"),
                    "info_idx": tray.get("tray_info_idx"),
                    "uuid": tray.get("tray_uuid"),
                    "tag_uid": tray.get("tag_uid"),
                    "remain": tray.get("remain"),
                    "weight": tray.get("tray_weight"),
                    "diameter": tray.get("tray_diameter"),
                    "temp_min": tray.get("nozzle_temp_min"),
                    "temp_max": tray.get("nozzle_temp_max"),
                    "bed_temp": tray.get("bed_temp"),
                    "drying_temp": tray.get("drying_temp"),
                    "drying_time": tray.get("drying_time"),
                })

        vt = s.get("vt_tray", {})
        if vt.get("tray_type"):
            color_hex = vt.get("tray_color", "")
            trays.append({
                "ams_id": "external",
                "tray_id": "254",
                "type": vt.get("tray_type"),
                "color": f"#{color_hex[:6]}" if len(color_hex) >= 6 else None,
                "color_full": color_hex,
                "brand": vt.get("tray_sub_brands"),
                "name": vt.get("tray_id_name"),
                "info_idx": vt.get("tray_info_idx"),
                "uuid": vt.get("tray_uuid"),
                "tag_uid": vt.get("tag_uid"),
                "remain": vt.get("remain"),
                "weight": vt.get("tray_weight"),
                "diameter": vt.get("tray_diameter"),
                "temp_min": vt.get("nozzle_temp_min"),
                "temp_max": vt.get("nozzle_temp_max"),
            })

        ams = {
            "trays": trays,
            "active_tray": ams_raw.get("tray_now"),
            "previous_tray": ams_raw.get("tray_pre"),
            "target_tray": ams_raw.get("tray_tar"),
            "tray_exist_bits": ams_raw.get("tray_exist_bits"),
            "tray_is_bbl_bits": ams_raw.get("tray_is_bbl_bits"),
            "insert_flag": ams_raw.get("insert_flag"),
            "rfid_status": s.get("ams_rfid_status"),
            "ams_status": s.get("ams_status"),
            "units": [
                {
                    "id": unit.get("id"),
                    "humidity": unit.get("humidity"),
                    "temp": unit.get("temp"),
                }
                for unit in ams_units
            ],
        }

        # ── Lights ────────────────────────────────────────────────────────────
        lights = {}
        for light in s.get("lights_report", []):
            lights[light.get("node")] = light.get("mode")

        # ── Fans ──────────────────────────────────────────────────────────────
        fans = {
            "part_cooling": s.get("cooling_fan_speed"),
            "auxiliary": s.get("big_fan1_speed"),
            "chamber": s.get("big_fan2_speed"),
            "heatbreak": s.get("heatbreak_fan_speed"),
            "aux_installed": s.get("aux_part_fan"),
            "gear": s.get("fan_gear"),
        }

        # ── XCam ──────────────────────────────────────────────────────────────
        xcam_raw = s.get("xcam", {})
        xcam = {
            "first_layer_inspector": xcam_raw.get("first_layer_inspector"),
            "spaghetti_detector": xcam_raw.get("spaghetti_detector"),
            "printing_monitor": xcam_raw.get("printing_monitor"),
            "buildplate_marker": xcam_raw.get("buildplate_marker_detector"),
            "print_halt": xcam_raw.get("print_halt"),
            "halt_sensitivity": xcam_raw.get("halt_print_sensitivity"),
            "allow_skip_parts": xcam_raw.get("allow_skip_parts"),
        }

        # ── Camera ────────────────────────────────────────────────────────────
        ipcam_raw = s.get("ipcam", {})
        camera = {
            "present": ipcam_raw.get("ipcam_dev") == "1",
            "recording": ipcam_raw.get("ipcam_record"),
            "timelapse": ipcam_raw.get("timelapse"),
            "resolution": ipcam_raw.get("resolution"),
        }

        # ── Upgrade state ─────────────────────────────────────────────────────
        upgrade_raw = s.get("upgrade_state", {})
        upgrade = {
            "status": upgrade_raw.get("status"),
            "progress": upgrade_raw.get("progress"),
            "ota_version": upgrade_raw.get("ota_new_version_number"),
            "ams_version": upgrade_raw.get("ams_new_version_number"),
            "force_upgrade": upgrade_raw.get("force_upgrade"),
            "message": upgrade_raw.get("message"),
        }

        # ── Upload state ──────────────────────────────────────────────────────
        upload_raw = s.get("upload", {})
        upload = {
            "status": upload_raw.get("status"),
            "progress": upload_raw.get("progress"),
            "message": upload_raw.get("message"),
            "speed": upload_raw.get("speed"),
        }

        return {
            # ── Connection ────────────────────────────────────────────────────
            "connected": self._connected,

            # ── Print state ───────────────────────────────────────────────────
            "state": s.get("gcode_state", "UNKNOWN"),
            "file": s.get("subtask_name", ""),
            "gcode_file": s.get("gcode_file", ""),
            "progress": s.get("mc_percent", 0),
            "remaining_minutes": s.get("mc_remaining_time", 0),
            "layer": s.get("layer_num", 0),
            "total_layers": s.get("total_layer_num", 0),
            "print_type": s.get("print_type"),
            "gcode_start_time": s.get("gcode_start_time"),
            "prepare_percent": s.get("gcode_file_prepare_percent"),
            "print_stage": s.get("mc_print_stage"),
            "print_sub_stage": s.get("mc_print_sub_stage"),
            "queue_number": s.get("queue_number"),
            "task_id": s.get("task_id"),
            "subtask_id": s.get("subtask_id"),
            "profile_id": s.get("profile_id"),
            "project_id": s.get("project_id"),

            # ── Errors ────────────────────────────────────────────────────────
            "print_error": s.get("print_error", 0),
            "print_error_code": s.get("mc_print_error_code"),
            "fail_reason": s.get("fail_reason"),
            "hms": s.get("hms", []),

            # ── Temperatures ──────────────────────────────────────────────────
            "nozzle_temp": s.get("nozzle_temper"),
            "nozzle_target": s.get("nozzle_target_temper"),
            "bed_temp": s.get("bed_temper"),
            "bed_target": s.get("bed_target_temper"),
            "chamber_temp": s.get("chamber_temper"),

            # ── Nozzle ────────────────────────────────────────────────────────
            "nozzle_diameter": s.get("nozzle_diameter"),

            # ── Speed ─────────────────────────────────────────────────────────
            "speed_level": s.get("spd_lvl"),
            "speed_percent": s.get("spd_mag"),

            # ── Network ───────────────────────────────────────────────────────
            "wifi_signal": s.get("wifi_signal"),
            "online": s.get("online", {}),

            # ── Hardware ──────────────────────────────────────────────────────
            "sdcard": s.get("sdcard"),
            "home_flag": s.get("home_flag"),
            "hw_switch_state": s.get("hw_switch_state"),
            "lifecycle": s.get("lifecycle"),
            "force_upgrade": s.get("force_upgrade"),

            # ── Subsystems ────────────────────────────────────────────────────
            "ams": ams,
            "fans": fans,
            "lights": lights,
            "xcam": xcam,
            "camera": camera,
            "upgrade": upgrade,
            "upload": upload,
        }



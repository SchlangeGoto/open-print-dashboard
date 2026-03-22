import requests
import cloudscraper
import logging

from app.core.bambu_exceptions import *

logger = logging.getLogger("uvicorn.error")


from app.db.db_helper import get_credentials, get_cloud_token_db

BASE_URL = "https://api.bambulab.com"

class BambuCloudClient:
    """Small client for the Bambu Lab cloud API.

    The client authenticates with email/password and stores the returned
    bearer token in memory for subsequent requests.

    Notes:
    - Some accounts require an email verification code during login.
    - `login()` must be called before any request method.
    """
    def __init__(self):
        self.email = None
        self.password = None
        self.token = None
        self.user_id = None

    def set_credentials(self, email: str, password: str):
        self.email = email
        self.password = password

    def _load_credentials(self):
        """Load credentials from db only when needed."""
        if not self.email:
            creds = get_credentials()
            self.email = creds.get("email")
            self.password = creds.get("password")

    def _load_token(self):
        """Load token from db only when needed."""
        if not self.token:
            self.token = get_cloud_token_db()

    def login(self, code: str | None = None):
        """Authenticate and store the access token.

        If the API requests email-based verification, the user is prompted
        interactively for the code and the login request is repeated.
        """
        payload = {"account": self.email, "password": self.password}
        if code:
            payload["code"] = code
        resp = requests.post(
            f"{BASE_URL}/v1/user-service/user/login",
            json=payload,
            timeout=30,
        )

        if resp.status_code == 403 and 'cloudflare' in resp.text.lower():
            logger.debug("Cloudflare detected, using cloudscraper")
            scraper = cloudscraper.create_scraper()
            resp = scraper.post(f"{BASE_URL}/v1/user-service/user/login", json=payload)
            if resp.status_code == 403 and 'cloudflare' in resp.text.lower():
                raise CloudflareError()

        if code and resp.status_code == 400:
            error_code = resp.json().get("code")
            if error_code == 1:
                raise CodeExpiredError()
            elif error_code == 2:
                raise CodeIncorrectError()

        resp.raise_for_status()
        data = resp.json()

        # Bambu returns loginType="verifyCode" if 2FA email was sent
        if data.get("loginType") == "verifyCode" and not code:
            raise CodeRequiredError()
        self.token = data["accessToken"]

    def _headers(self) -> dict:
        self._load_token()
        logger.debug(f"Token loaded: {self.token[:10] if self.token else 'None'}")
        if not self.token:
            raise RuntimeError("No token available — login first")
        return {"Authorization": f"Bearer {self.token}"}

    def get_user_id(self) -> str:
        """Fetch and cache the current user's Bambu Cloud user id."""
        resp = requests.get(
            f"{BASE_URL}/v1/design-user-service/my/preference",
            headers=self._headers(),
        )
        resp.raise_for_status()
        self.user_id = resp.json()["uid"]
        return self.user_id

    def get_devices(self) -> list[dict]:
        """List all printers on your account."""
        self._load_token()
        resp = requests.get(
            f"{BASE_URL}/v1/iot-service/api/user/bind",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json().get("devices", [])

    def get_print_tasks(self, limit: int = 20) -> list[dict]:
        """Return recent print tasks for the authenticated account."""
        self._load_token()
        resp = requests.get(
            f"{BASE_URL}/v1/user-service/my/tasks",
            headers=self._headers(),
            params={"limit": limit},
        )
        resp.raise_for_status()
        return resp.json().get("hits", [])

    def get_print_tasks_for_printer(self, serial: str, limit: int = 20) -> list[dict]:
        """Return recent print tasks filtered by printer serial."""
        all_tasks = self.get_print_tasks(limit=limit)
        return [t for t in all_tasks if t.get("deviceId") == serial]

    def get_latest_task_for_printer(self, serial: str) -> dict | None:
        """Return the most recent print task for a specific printer."""
        tasks = self.get_print_tasks_for_printer(serial)
        return tasks[0] if tasks else None

    def get_slicer_settings(self) -> dict:
        """
        Returns filament profiles, printer profiles and print profiles.
        Useful for mapping tray_info_idx codes to human-readable names.
        """
        self._load_token()
        resp = requests.get(
            f"{BASE_URL}/v1/iot-service/api/slicer/setting",
            headers=self._headers(),
            params={"version": "1.0"},
        )
        resp.raise_for_status()
        return resp.json()

    def get_filament_profiles(self) -> list[dict]:
        """Return only the filament profiles from slicer settings."""
        settings = self.get_slicer_settings()
        filament = settings.get("filament", {})
        return filament.get("public", []) + filament.get("private", [])

    def get_projects(self) -> list[dict]:
        """Return saved projects/models on your account."""
        self._load_token()
        resp = requests.get(
            f"{BASE_URL}/v1/user-service/my/projects",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json().get("projects", [])

    def get_user_profile(self) -> dict:
        """
        Return your account preferences and user ID.
        Also used to validate the token is still active.
        """
        self._load_token()
        resp = requests.get(
            f"{BASE_URL}/v1/design-user-service/my/preference",
            headers=self._headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        self.user_id = data.get("uid")
        return data

    def download_cover_image(self, url: str) -> bytes | None:
        """
        Download a print thumbnail image from the cover URL in a task.
        The cover URL is unauthenticated — no token needed.
        """
        try:
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            return resp.content
        except requests.RequestException as e:
            logger.error(f"Failed to download cover image: {e}")
            return None

    def get_firmware_info(self, device_id: str) -> dict:
        """Firmware version and available updates for your printer."""
        self._load_token()
        resp = requests.get(
            f"{BASE_URL}/v1/iot-service/api/user/device/version",
            headers=self._headers(),
            params={"dev_id": device_id},
        )
        resp.raise_for_status()
        devices = resp.json().get("devices", [])
        return devices[0] if devices else {}

    def get_cloud_print_status(self) -> list[dict]:
        """
        Cloud-side print status for all your printers.
        Useful as fallback when MQTT is unavailable.
        """
        self._load_token()
        resp = requests.get(
            f"{BASE_URL}/v1/iot-service/api/user/print",
            headers=self._headers(),
            params={"force": "true"},
        )
        resp.raise_for_status()
        return resp.json().get("devices", [])

    def get_ttcode(self, device_id: str) -> dict:
        """
        Get authentication token for the camera stream.
        Needed if you want to implement live camera view later.
        Returns ttcode, passwd and authkey.
        """
        self._load_token()
        resp = requests.post(
            f"{BASE_URL}/v1/iot-service/api/user/ttcode",
            headers=self._headers(),
            json={"dev_id": device_id},
        )
        resp.raise_for_status()
        return resp.json()

    def get_project(self, project_id: str) -> dict:
        """Full details for a single project including plate thumbnails and filament usage."""
        self._load_token()
        resp = requests.get(
            f"{BASE_URL}/v1/iot-service/api/user/project/{project_id}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    def get_slicer_setting_details(self, setting_id: str) -> dict:
        """
        Full data for a specific slicer profile by its ID.
        Useful for getting exact filament temperatures, speeds etc.
        """
        self._load_token()
        resp = requests.get(
            f"{BASE_URL}/v1/iot-service/api/slicer/setting/{setting_id}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    def rename_device(self, device_id: str, name: str) -> bool:
        """Rename a printer on your account."""
        self._load_token()
        resp = requests.patch(
            f"{BASE_URL}/v1/iot-service/api/user/device/info",
            headers=self._headers(),
            json={"dev_id": device_id, "name": name},
        )
        return resp.json().get("message") == "success"

    def is_token_valid(self) -> bool:
        self._load_token()
        if not self.token:
            return False
        try:
            resp = requests.get(
                f"{BASE_URL}/v1/design-user-service/my/preference",
                headers=self._headers(),
                timeout=10,
            )
            return resp.status_code == 200
        except requests.RequestException:
            return False
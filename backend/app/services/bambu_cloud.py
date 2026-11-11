import logging
from urllib.parse import urlparse

import cloudscraper
import requests

from app.core.bambu_exceptions import (
    CloudflareError,
    CodeExpiredError,
    CodeIncorrectError,
    CodeRequiredError,
    NotLoggedInError,
)
from app.core.store import get_cloud_credentials, get_cloud_token

logger = logging.getLogger("uvicorn.error")

BASE_URL = "https://api.bambulab.com"

# Every cloud call must be bounded: a stalled TLS connection would pin a
# request worker or the print-job save thread indefinitely.
DEFAULT_TIMEOUT = 15

# Cover images are only ever fetched from Bambu Lab content hosts. Anything
# else is refused so the endpoint cannot be used as an SSRF proxy.
ALLOWED_COVER_HOSTS = ("bblmw.com", "bambulab.com")
MAX_COVER_BYTES = 10 * 1024 * 1024


def is_allowed_cover_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    return any(
        host == domain or host.endswith(f".{domain}") for domain in ALLOWED_COVER_HOSTS
    )


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
            creds = get_cloud_credentials()
            self.email = creds.get("email")
            self.password = creds.get("password")

    def _load_token(self):
        """Load token from db only when needed."""
        if not self.token:
            self.token = get_cloud_token()

    def login(self, code: str | None = None):
        """Authenticate and store the access token.

        If the API requests email-based verification, the user is prompted
        interactively for the code and the login request is repeated.
        """
        self._load_credentials()
        payload = {"account": self.email, "password": self.password}
        if code:
            payload["code"] = code
        resp = requests.post(
            f"{BASE_URL}/v1/user-service/user/login",
            json=payload,
            timeout=30,
        )

        if resp.status_code == 403 and "cloudflare" in resp.text.lower():
            logger.debug("Cloudflare detected, using cloudscraper")
            scraper = cloudscraper.create_scraper()
            resp = scraper.post(
                f"{BASE_URL}/v1/user-service/user/login",
                json=payload,
                timeout=30,
            )
            if resp.status_code == 403 and "cloudflare" in resp.text.lower():
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
        # The user id belongs to the account behind the token.
        self.user_id = None

    def _headers(self) -> dict:
        self._load_token()
        logger.debug(f"Token loaded: {self.token[:10] if self.token else 'None'}")
        if not self.token:
            raise NotLoggedInError()
        return {"Authorization": f"Bearer {self.token}"}

    def get_user_id(self) -> str:
        """Fetch and cache the current user's Bambu Cloud user id."""
        if self.user_id:
            return self.user_id
        resp = requests.get(
            f"{BASE_URL}/v1/design-user-service/my/preference",
            headers=self._headers(),
            timeout=DEFAULT_TIMEOUT,
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
            timeout=DEFAULT_TIMEOUT,
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
            timeout=DEFAULT_TIMEOUT,
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

    def get_task(self, task_id: str) -> dict | None:
        """Return one print task by its Bambu Cloud task id.

        The account task list is the only documented lookup, so fetch a large
        enough page and filter locally. Looking the task up by id matters when
        the next print has already started before the previous one's finish
        poll lands.
        """
        for task in self.get_print_tasks(limit=100):
            if str(task.get("id")) == str(task_id):
                return task
        return None

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
            timeout=DEFAULT_TIMEOUT,
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
            timeout=DEFAULT_TIMEOUT,
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
            timeout=DEFAULT_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        self.user_id = data.get("uid")
        return data

    def reset_session(self) -> None:
        """Forget the in-memory Bambu Cloud session."""
        self.email = None
        self.password = None
        self.token = None
        self.user_id = None

    def download_cover_image(self, url: str) -> bytes | None:
        """
        Download a print thumbnail image from the cover URL in a task.
        The cover URL is unauthenticated — no token needed.
        """
        if not is_allowed_cover_url(url):
            logger.warning("Refused to fetch a cover image from %s", url)
            return None
        try:
            with requests.get(
                url, timeout=DEFAULT_TIMEOUT, allow_redirects=False, stream=True
            ) as resp:
                resp.raise_for_status()
                if resp.is_redirect or resp.status_code >= 300:
                    logger.warning("Cover URL redirected; refusing %s", url)
                    return None
                content_type = (resp.headers.get("Content-Type") or "").lower()
                if not content_type.startswith(
                    ("image/", "application/octet-stream", "binary/octet-stream")
                ):
                    logger.warning(
                        "Cover URL returned %s; refusing %s",
                        content_type or "no content type",
                        url,
                    )
                    return None
                content = bytearray()
                for chunk in resp.iter_content(chunk_size=64 * 1024):
                    content.extend(chunk)
                    if len(content) > MAX_COVER_BYTES:
                        logger.warning(
                            "Cover image at %s exceeds %s bytes", url, MAX_COVER_BYTES
                        )
                        return None
                if not content:
                    logger.warning("Cover URL returned an empty body: %s", url)
                    return None
                return bytes(content)
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
            timeout=DEFAULT_TIMEOUT,
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
            timeout=DEFAULT_TIMEOUT,
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
            timeout=DEFAULT_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()

    def get_project(self, project_id: str) -> dict:
        """Full details for a single project including plate thumbnails and filament usage."""
        self._load_token()
        resp = requests.get(
            f"{BASE_URL}/v1/iot-service/api/user/project/{project_id}",
            headers=self._headers(),
            timeout=DEFAULT_TIMEOUT,
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
            timeout=DEFAULT_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()

    def get_messages(self, limit: int = 20) -> list[dict]:
        """Notification messages — includes print completion notifications."""
        self._load_token()
        resp = requests.get(
            f"{BASE_URL}/v1/user-service/my/messages",
            headers=self._headers(),
            params={"limit": limit},
            timeout=DEFAULT_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("hits", [])

    def rename_device(self, device_id: str, name: str) -> bool:
        """Rename a printer on your account."""
        self._load_token()
        resp = requests.patch(
            f"{BASE_URL}/v1/iot-service/api/user/device/info",
            headers=self._headers(),
            json={"dev_id": device_id, "name": name},
            timeout=DEFAULT_TIMEOUT,
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
                timeout=DEFAULT_TIMEOUT,
            )
            return resp.status_code == 200
        except requests.RequestException:
            return False

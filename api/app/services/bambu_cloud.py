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
        """Return authorization headers for authenticated requests."""
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
        resp = requests.get(
            f"{BASE_URL}/v1/iot-service/api/user/bind",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json().get("devices", [])

    def get_print_tasks(self, limit: int = 20) -> list[dict]:
        """Return recent print tasks for the authenticated account."""
        resp = requests.get(
            f"{BASE_URL}/v1/user-service/my/tasks",
            headers=self._headers(),
            params={"limit": limit},
        )
        resp.raise_for_status()
        return resp.json().get("hits", [])

    def get_filament_profiles(self) -> list[dict]:
        """Return available filament/slicer setting profiles."""
        resp = requests.get(
            f"{BASE_URL}/v1/iot-service/api/slicer/setting",
            headers=self._headers(),
            params={"version": "1.0"},
        )
        resp.raise_for_status()
        return resp.json()

    def is_token_valid(self) -> bool:
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
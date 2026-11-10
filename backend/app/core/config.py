from typing import Literal

from pydantic import (
    EmailStr,
    PostgresDsn,
    computed_field,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Use the top level .env file (one level above ./backend/)
        env_file="../.env",
        env_ignore_empty=True,
        extra="ignore",
    )

    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "OpenPrintDashboard"
    SECRET_KEY: str
    # Encrypts the stored Bambu Cloud credentials. When unset, a key is derived
    # from SECRET_KEY for backwards compatibility. Set this to rotate
    # SECRET_KEY without losing the stored Bambu login.
    BAMBU_CREDENTIALS_KEY: str | None = None
    # Short-lived access tokens are refreshed transparently by the web and
    # native clients. Refresh tokens rotate on every use and stay valid while
    # the session is active.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 90
    # A just-rotated token may be retried by a racing tab without treating it
    # as a stolen token. After this window, reuse revokes every session.
    REFRESH_TOKEN_REUSE_GRACE_SECONDS: int = 30
    FRONTEND_HOST: str = "http://localhost:3000"
    FASTAPI_ENV: Literal["development"] | None = None

    DATABASE_URL: PostgresDsn

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _use_psycopg_driver(cls, value: str | PostgresDsn) -> str:
        database_url = str(value)
        for scheme in ("postgres://", "postgresql://"):
            if database_url.startswith(scheme):
                return database_url.replace(scheme, "postgresql+psycopg://", 1)
        return database_url

    # Optional bootstrap of the first superuser. When unset, the setup wizard
    # creates the first account instead.
    FIRST_SUPERUSER: EmailStr | None = None
    FIRST_SUPERUSER_PASSWORD: str | None = None

    # Used by the test suite to create a non-superuser account.
    EMAIL_TEST_USER: EmailStr = "test@example.com"

    # Email / SMTP (Mailpit in local development)
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: EmailStr | None = None
    EMAILS_FROM_NAME: str | None = None
    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48

    @model_validator(mode="after")
    def _set_default_emails_from(self) -> "Settings":
        if not self.EMAILS_FROM_NAME:
            self.EMAILS_FROM_NAME = self.PROJECT_NAME
        return self

    @model_validator(mode="after")
    def _reject_insecure_secret_key(self) -> "Settings":
        # The example file ships a placeholder. Outside development that is a
        # public signing key, so refuse to start instead of accepting forged
        # tokens.
        if self.FASTAPI_ENV == "development":
            return self
        if (
            self.SECRET_KEY.strip().lower() in {"", "changethis"}
            or len(self.SECRET_KEY) < 32
        ):
            raise ValueError(
                "SECRET_KEY must be a random value of at least 32 characters. "
                "Generate one with: openssl rand -hex 32"
            )
        if self.BAMBU_CREDENTIALS_KEY and len(self.BAMBU_CREDENTIALS_KEY) < 32:
            raise ValueError("BAMBU_CREDENTIALS_KEY must be at least 32 characters")
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def emails_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.EMAILS_FROM_EMAIL)

    # Bambu Cloud MQTT. Global accounts use the us broker; mainland China
    # accounts use cn.mqtt.bambulab.com.
    BAMBU_CLOUD_MQTT_HOST: str = "us.mqtt.bambulab.com"
    BAMBU_CLOUD_MQTT_PORT: int = 8883

    # Deprecated: LAN mode is retired and these are no longer read. Kept for
    # one release so existing .env files keep loading, then removed.
    PRINTER_IP: str | None = None
    PRINTER_SERIAL: str | None = None
    PRINTER_ACCESS_CODE: str | None = None


settings = Settings()  # type: ignore

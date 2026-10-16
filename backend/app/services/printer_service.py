import logging

from app.core.store import (
    get_printer_config,
    save_cloud_credentials,
    save_cloud_token,
)
from app.services.bambu_client import BambuClient
from app.services.bambu_cloud import BambuCloudClient

logger = logging.getLogger("uvicorn.error")


class PrinterService:
    def __init__(
        self,
        client: BambuClient,
        cloud_client: BambuCloudClient,
    ) -> None:
        self.client = client
        self.cloud_client = cloud_client

    def get_token(self) -> str | None:
        return self.cloud_client.token

    def login(self, code: str | None = None) -> None:
        self.cloud_client.login(code)
        self.save_token()
        self.save_credentials()

    def save_token(self) -> None:
        if self.cloud_client.token:
            save_cloud_token(self.cloud_client.token)

    def save_credentials(self) -> None:
        if self.cloud_client.email and self.cloud_client.password:
            save_cloud_credentials(self.cloud_client.email, self.cloud_client.password)

    def configure_and_connect(self) -> None:
        """Load the printer configuration and start the MQTT connection."""
        config = get_printer_config()
        self.client.configure(config["ip"], config["serial"], config["access_code"])
        if self.client.is_configured:
            self.client.connect()
        else:
            logger.info("Printer is not configured — MQTT connection skipped")

    def reload(self) -> None:
        """Reconnect using the current stored configuration."""
        self.client.disconnect()
        self.configure_and_connect()


printer_service = PrinterService(BambuClient(), BambuCloudClient())

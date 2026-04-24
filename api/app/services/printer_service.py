from app.db.crud import save_token, save_credentials
from app.services.bambu_client import BambuClient
from app.services.bambu_cloud import BambuCloudClient


class PrinterService:
    def __init__(
        self,
        client: BambuClient,
        cloud_client: BambuCloudClient,
    ) -> None:
        self.client = client
        self.cloud_client = cloud_client

    def get_token(self) -> str:
        return self.cloud_client.token

    def login(self, code: str | None = None) -> None:
        self.cloud_client.login(code)
        save_token(self.cloud_client.token)
        save_credentials(self.cloud_client.email, self.cloud_client.password)

printer_service = PrinterService(BambuClient(), BambuCloudClient())

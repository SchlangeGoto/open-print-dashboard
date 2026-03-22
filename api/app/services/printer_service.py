from sqlmodel import Session
from app.db.database import engine
from app.db.models import Settings
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
        self.save_token()
        self.save_credentials()

    def save_token(self) -> None:
        with Session(engine) as session:
            setting = session.get(Settings, "bambu_cloud_token")
            if setting:
                setting.value = self.cloud_client.token
            else:
                setting = Settings(key="bambu_cloud_token", value=self.cloud_client.token)
                session.add(setting)
            session.commit()

    def save_credentials(self) -> None:
        with Session(engine) as session:
            for key, value in [
                ("bambu_cloud_email", self.cloud_client.email),
                ("bambu_cloud_password", self.cloud_client.password),
            ]:
                setting = session.get(Settings, key)
                if setting:
                    setting.value = value
                else:
                    session.add(Settings(key=key, value=value))
            session.commit()

printer_service = PrinterService(BambuClient(), BambuCloudClient())
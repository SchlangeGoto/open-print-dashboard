from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import AppSetting


def test_settings_mask_secrets(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    db.add(AppSetting(key="bambu_cloud_password", value="plain-text"))
    db.commit()

    r = client.get(f"{settings.API_V1_STR}/settings/", headers=superuser_token_headers)

    assert r.status_code == 200, r.text
    values = {item["key"]: item["value"] for item in r.json()}
    assert values["bambu_cloud_password"] == "••••••••"

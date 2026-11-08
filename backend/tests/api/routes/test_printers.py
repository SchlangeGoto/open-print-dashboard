import uuid

from fastapi.testclient import TestClient

from app.core.config import settings


def _serial() -> str:
    return f"test-{uuid.uuid4().hex}"


def test_create_cloud_printer_without_local_credentials(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    serial = _serial()
    response = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={
            "name": "Cloud printer",
            "serial": serial,
            "connection_mode": "cloud",
        },
    )

    assert response.status_code == 200, response.text
    printer = response.json()
    assert printer["serial"] == serial
    assert printer["connection_mode"] == "cloud"
    assert printer["configured"] is True
    assert printer["ip"] is None
    assert printer["access_code"] is None


def test_lan_printer_requires_ip_and_access_code(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={
            "name": "LAN printer",
            "serial": _serial(),
            "connection_mode": "lan",
        },
    )

    assert response.status_code == 422


def test_switch_printer_to_cloud_clears_lan_credentials(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    serial = _serial()
    created = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={
            "name": "Cloud printer",
            "serial": serial,
            "connection_mode": "cloud",
        },
    )
    assert created.status_code == 200, created.text
    printer_id = created.json()["id"]

    updated = client.put(
        f"{settings.API_V1_STR}/printers/{printer_id}",
        headers=superuser_token_headers,
        json={
            "connection_mode": "cloud",
            "ip": None,
            "access_code": None,
        },
    )

    assert updated.status_code == 200, updated.text
    printer = updated.json()
    assert printer["connection_mode"] == "cloud"
    assert printer["ip"] is None
    assert printer["access_code"] is None

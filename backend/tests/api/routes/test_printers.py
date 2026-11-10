import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
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


def test_printer_access_code_is_write_only(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    serial = _serial()
    created = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={
            "name": "LAN printer",
            "serial": serial,
            "connection_mode": "lan",
            "ip": "10.0.0.5",
            "access_code": "12345678",
        },
    )
    assert created.status_code == 200, created.text
    printer = created.json()
    assert printer["access_code"] is None
    printer_id = printer["id"]

    listed = client.get(
        f"{settings.API_V1_STR}/printers/", headers=superuser_token_headers
    ).json()
    match = next(item for item in listed if item["serial"] == serial)
    assert match["access_code"] is None

    # An empty value from the edit form keeps the stored code.
    updated = client.put(
        f"{settings.API_V1_STR}/printers/{printer_id}",
        headers=superuser_token_headers,
        json={"access_code": ""},
    )
    assert updated.status_code == 200, updated.text
    db.expire_all()
    stored = crud.get_printer(session=db, printer_id=uuid.UUID(printer_id))
    assert stored is not None
    assert stored.access_code == "12345678"

    # A new value replaces it.
    updated = client.put(
        f"{settings.API_V1_STR}/printers/{printer_id}",
        headers=superuser_token_headers,
        json={"access_code": "87654321"},
    )
    assert updated.status_code == 200, updated.text
    db.expire_all()
    stored = crud.get_printer(session=db, printer_id=uuid.UUID(printer_id))
    assert stored is not None
    assert stored.access_code == "87654321"


def test_duplicate_serial_race_returns_409(
    client: TestClient, superuser_token_headers: dict[str, str], monkeypatch
) -> None:
    serial = _serial()
    first = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={"name": "First", "serial": serial, "connection_mode": "cloud"},
    )
    assert first.status_code == 200, first.text

    # Simulate two concurrent creates: the pre-check no longer sees the row,
    # so the unique index has to produce the 409.
    monkeypatch.setattr(
        "app.api.routes.printers.crud.get_printer_by_serial",
        lambda **_: None,
    )
    second = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={"name": "Second", "serial": serial, "connection_mode": "cloud"},
    )

    assert second.status_code == 409, second.text

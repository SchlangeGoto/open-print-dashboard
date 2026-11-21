import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import Printer


def _serial() -> str:
    return f"test-{uuid.uuid4().hex}"


def test_create_cloud_printer(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    serial = _serial()
    response = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={"name": "Cloud printer", "serial": serial},
    )

    assert response.status_code == 200, response.text
    printer = response.json()
    assert printer["serial"] == serial
    assert printer["configured"] is True
    # LAN mode is retired; the deprecated fields are not part of the contract.
    assert "connection_mode" not in printer
    assert "ip" not in printer
    assert "access_code" not in printer


def test_legacy_lan_payload_is_ignored(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    serial = _serial()
    response = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={
            "name": "Legacy LAN payload",
            "serial": serial,
            "connection_mode": "lan",
            "ip": "10.0.0.5",
            "access_code": "12345678",
        },
    )

    assert response.status_code == 200, response.text
    printer = response.json()
    assert printer["serial"] == serial
    assert "connection_mode" not in printer


def test_update_printer_name(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    created = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={"name": "Original", "serial": _serial()},
    )
    assert created.status_code == 200, created.text
    printer_id = created.json()["id"]

    updated = client.put(
        f"{settings.API_V1_STR}/printers/{printer_id}",
        headers=superuser_token_headers,
        json={"name": "Renamed"},
    )

    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Renamed"


def test_duplicate_serial_race_returns_409(
    client: TestClient, superuser_token_headers: dict[str, str], monkeypatch
) -> None:
    serial = _serial()
    first = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={"name": "First", "serial": serial},
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
        json={"name": "Second", "serial": serial},
    )

    assert second.status_code == 409, second.text


def test_stale_gcode_state_does_not_mark_a_printer_online() -> None:
    from app.api.routes.printers import _serialize_printers

    printer = Printer(name="Stale state", serial="test-stale-state")
    result = _serialize_printers(
        printer=printer,
        status={"connected": False, "gcode_state": "RUNNING"},
    )

    assert result.online is False


def test_update_printer_rejects_a_null_name(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    printer = Printer(name="Null name", serial=f"null-{uuid.uuid4().hex}")
    db.add(printer)
    db.commit()
    db.refresh(printer)

    r = client.put(
        f"{settings.API_V1_STR}/printers/{printer.id}",
        headers=superuser_token_headers,
        json={"name": None},
    )
    assert r.status_code == 422


def test_print_control_sends_pause_resume_and_stop(
    client: TestClient, superuser_token_headers: dict[str, str], monkeypatch
) -> None:
    from app.services.printer_service import printer_service

    created = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={"name": "Controlled", "serial": _serial()},
    )
    assert created.status_code == 200, created.text
    printer_id = created.json()["id"]

    sent: list[str] = []

    class FakeClient:
        is_configured = True

        def current_task_id(self) -> str:
            return "task-current"

        def pause_print(self) -> bool:
            sent.append("pause")
            return True

        def resume_print(self) -> bool:
            sent.append("resume")
            return True

        def stop_print(self) -> bool:
            sent.append("stop")
            return True

    monkeypatch.setattr(printer_service, "get_client", lambda serial: FakeClient())

    for action in ("pause", "resume", "stop"):
        response = client.post(
            f"{settings.API_V1_STR}/printers/{printer_id}/print/{action}",
            headers=superuser_token_headers,
            json={"task_id": "task-current"},
        )
        assert response.status_code == 200, response.text
        assert action in response.json()["message"]

    assert sent == ["pause", "resume", "stop"]


def test_print_control_refuses_a_replaced_job(
    client: TestClient, superuser_token_headers: dict[str, str], monkeypatch
) -> None:
    from app.services.printer_service import printer_service

    created = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={"name": "Replaced", "serial": _serial()},
    )
    assert created.status_code == 200, created.text
    printer_id = created.json()["id"]

    sent: list[str] = []

    class FakeClient:
        is_configured = True

        def current_task_id(self) -> str:
            return "task-new"

        def stop_print(self) -> bool:
            sent.append("stop")
            return True

    monkeypatch.setattr(printer_service, "get_client", lambda serial: FakeClient())

    response = client.post(
        f"{settings.API_V1_STR}/printers/{printer_id}/print/stop",
        headers=superuser_token_headers,
        json={"task_id": "task-confirmed"},
    )
    assert response.status_code == 409
    assert sent == []


def test_print_control_rejects_an_unconnected_printer(
    client: TestClient, superuser_token_headers: dict[str, str], monkeypatch
) -> None:
    from app.services.printer_service import printer_service

    created = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=superuser_token_headers,
        json={"name": "Offline", "serial": _serial()},
    )
    assert created.status_code == 200, created.text
    printer_id = created.json()["id"]

    monkeypatch.setattr(printer_service, "get_client", lambda serial: None)

    response = client.post(
        f"{settings.API_V1_STR}/printers/{printer_id}/print/pause",
        headers=superuser_token_headers,
        json={"task_id": "task-current"},
    )
    assert response.status_code == 409

    missing = client.post(
        f"{settings.API_V1_STR}/printers/{uuid.uuid4()}/print/pause",
        headers=superuser_token_headers,
        json={"task_id": "task-current"},
    )
    assert missing.status_code == 404

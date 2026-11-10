import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import Printer, PrintJob


def _create_printer(db: Session) -> Printer:
    printer = Printer(
        name="Test printer",
        serial=f"test-{uuid.uuid4().hex}",
        ip="127.0.0.1",
        access_code="00000000",
        connection_mode="lan",
    )
    db.add(printer)
    db.commit()
    db.refresh(printer)
    return printer


def _create_filament(client: TestClient, headers: dict[str, str]) -> str:
    data = {
        "brand": "Bambu Lab",
        "material": "PLA",
        "color_name": "Black",
        "color_hex": "#000000",
    }
    return client.post(
        f"{settings.API_V1_STR}/filaments/", headers=headers, json=data
    ).json()["id"]


def test_create_and_activate_spool(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    filament_id = _create_filament(client, superuser_token_headers)
    printer = _create_printer(db)
    data = {
        "filament_id": filament_id,
        "total_weight_g": 1000,
        "remaining_g": 1000,
        "price_per_kg": 24.99,
    }
    r = client.post(
        f"{settings.API_V1_STR}/spools/",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    spool = r.json()
    assert spool["filament_id"] == filament_id

    r = client.put(
        f"{settings.API_V1_STR}/spools/{spool['id']}/activate",
        headers=superuser_token_headers,
        json={"printer_id": str(printer.id)},
    )
    assert r.status_code == 200
    assert r.json()["active"] is True
    assert r.json()["printer_id"] == str(printer.id)

    r = client.get(
        f"{settings.API_V1_STR}/spools/active",
        headers=superuser_token_headers,
        params={"printer_id": str(printer.id)},
    )
    assert r.status_code == 200
    assert r.json()["id"] == spool["id"]


def test_only_one_active_spool_per_printer(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    filament_id = _create_filament(client, superuser_token_headers)
    printer = _create_printer(db)
    base = {"filament_id": filament_id, "total_weight_g": 1000, "remaining_g": 1000}
    first = client.post(
        f"{settings.API_V1_STR}/spools/", headers=superuser_token_headers, json=base
    ).json()
    second = client.post(
        f"{settings.API_V1_STR}/spools/", headers=superuser_token_headers, json=base
    ).json()

    for spool in (first, second):
        r = client.put(
            f"{settings.API_V1_STR}/spools/{spool['id']}/activate",
            headers=superuser_token_headers,
            json={"printer_id": str(printer.id)},
        )
        assert r.status_code == 200

    active = client.get(
        f"{settings.API_V1_STR}/spools/active",
        headers=superuser_token_headers,
        params={"printer_id": str(printer.id)},
    ).json()
    assert active["id"] == second["id"]

    spools = client.get(
        f"{settings.API_V1_STR}/spools/", headers=superuser_token_headers
    ).json()["data"]
    by_id = {spool["id"]: spool for spool in spools}
    assert by_id[first["id"]]["active"] is False
    assert by_id[first["id"]]["printer_id"] is None
    assert by_id[second["id"]]["active"] is True
    assert by_id[second["id"]]["printer_id"] == str(printer.id)


def test_deleting_spool_keeps_print_history(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    filament_id = _create_filament(client, superuser_token_headers)
    spool = client.post(
        f"{settings.API_V1_STR}/spools/",
        headers=superuser_token_headers,
        json={
            "filament_id": filament_id,
            "total_weight_g": 1000,
            "remaining_g": 500,
        },
    ).json()

    job = PrintJob(title="Kept after spool delete", weight=12, spool_id=spool["id"])
    db.add(job)
    db.commit()
    db.refresh(job)
    job_id = job.id

    deleted = client.delete(
        f"{settings.API_V1_STR}/spools/{spool['id']}",
        headers=superuser_token_headers,
    )
    assert deleted.status_code == 200, deleted.text

    db.expire_all()
    preserved = db.get(PrintJob, job_id)
    assert preserved is not None
    assert preserved.spool_id is None


def test_deleting_filament_keeps_print_history(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    filament_id = _create_filament(client, superuser_token_headers)
    spool = client.post(
        f"{settings.API_V1_STR}/spools/",
        headers=superuser_token_headers,
        json={
            "filament_id": filament_id,
            "total_weight_g": 1000,
            "remaining_g": 750,
        },
    ).json()

    job = PrintJob(title="Kept after filament delete", weight=5, spool_id=spool["id"])
    db.add(job)
    db.commit()
    db.refresh(job)
    job_id = job.id

    deleted = client.delete(
        f"{settings.API_V1_STR}/filaments/{filament_id}",
        headers=superuser_token_headers,
    )
    assert deleted.status_code == 200, deleted.text

    db.expire_all()
    preserved = db.get(PrintJob, job_id)
    assert preserved is not None
    assert preserved.spool_id is None

import json
import time
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.config import settings
from app.models import (
    Filament,
    Printer,
    PrintJob,
    PrintJobFilamentUsage,
    Spool,
)


def _create_printer(db: Session) -> Printer:
    printer = Printer(
        name="Test printer",
        serial=f"test-{uuid.uuid4().hex}",
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
    # The first roll is still loaded in the printer; only "active" moved.
    assert by_id[first["id"]]["printer_id"] == str(printer.id)
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


def test_update_spool_with_unknown_filament_returns_404(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    filament_id = _create_filament(client, superuser_token_headers)
    spool = client.post(
        f"{settings.API_V1_STR}/spools/",
        headers=superuser_token_headers,
        json={
            "filament_id": filament_id,
            "total_weight_g": 1000,
            "remaining_g": 1000,
        },
    ).json()

    response = client.put(
        f"{settings.API_V1_STR}/spools/{spool['id']}",
        headers=superuser_token_headers,
        json={"filament_id": str(uuid.uuid4())},
    )

    assert response.status_code == 404


def test_activating_without_a_printer_returns_422(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    filament_id = _create_filament(client, superuser_token_headers)
    spool = client.post(
        f"{settings.API_V1_STR}/spools/",
        headers=superuser_token_headers,
        json={
            "filament_id": filament_id,
            "total_weight_g": 1000,
            "remaining_g": 1000,
            "active": True,
        },
    ).json()

    # Creation forces the spool inactive; flipping the flag without a printer
    # must be rejected instead of leaving an unreachable active spool.
    assert spool["active"] is False
    response = client.put(
        f"{settings.API_V1_STR}/spools/{spool['id']}",
        headers=superuser_token_headers,
        json={"active": True},
    )

    assert response.status_code == 422


def test_deleting_a_printer_unloads_its_spools(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    filament_id = _create_filament(client, superuser_token_headers)
    printer = _create_printer(db)
    spool = client.post(
        f"{settings.API_V1_STR}/spools/",
        headers=superuser_token_headers,
        json={
            "filament_id": filament_id,
            "total_weight_g": 1000,
            "remaining_g": 1000,
        },
    ).json()
    activated = client.put(
        f"{settings.API_V1_STR}/spools/{spool['id']}/activate",
        headers=superuser_token_headers,
        json={"printer_id": str(printer.id)},
    )
    assert activated.status_code == 200, activated.text

    deleted = client.delete(
        f"{settings.API_V1_STR}/printers/{printer.id}",
        headers=superuser_token_headers,
    )
    assert deleted.status_code == 200, deleted.text

    db.expire_all()
    stored = db.get(Spool, uuid.UUID(spool["id"]))
    assert stored is not None
    assert stored.active is False
    assert stored.printer_id is None


def test_active_spool_is_per_printer(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    filament_id = _create_filament(client, superuser_token_headers)
    first_printer = _create_printer(db)
    second_printer = _create_printer(db)

    spools = [
        client.post(
            f"{settings.API_V1_STR}/spools/",
            headers=superuser_token_headers,
            json={
                "filament_id": filament_id,
                "total_weight_g": 1000,
                "remaining_g": 1000,
            },
        ).json()
        for _ in range(3)
    ]

    for spool, printer in zip(spools[:2], (first_printer, second_printer), strict=True):
        response = client.put(
            f"{settings.API_V1_STR}/spools/{spool['id']}/activate",
            headers=superuser_token_headers,
            json={"printer_id": str(printer.id)},
        )
        assert response.status_code == 200, response.text

    # Activating on the first printer must not unload the second printer.
    response = client.put(
        f"{settings.API_V1_STR}/spools/{spools[2]['id']}/activate",
        headers=superuser_token_headers,
        json={"printer_id": str(first_printer.id)},
    )
    assert response.status_code == 200, response.text

    db.expire_all()
    by_id = {
        str(spool["id"]): db.get(Spool, uuid.UUID(spool["id"])) for spool in spools
    }
    assert by_id[spools[0]["id"]].active is False
    assert by_id[spools[1]["id"]].active is True
    assert by_id[spools[2]["id"]].active is True


def test_database_rejects_two_active_spools(
    db: Session,
) -> None:
    printer = _create_printer(db)
    first = Spool(
        total_weight_g=1000, remaining_g=1000, active=True, printer_id=printer.id
    )
    second = Spool(
        total_weight_g=1000, remaining_g=1000, active=True, printer_id=printer.id
    )
    db.add(first)
    db.add(second)

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_active_spool_ignores_inactive_rows_with_a_printer_id(
    db: Session,
) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    stale = Spool(
        total_weight_g=1000,
        remaining_g=1000,
        active=False,
        printer_id=printer.id,
        created_at=datetime.now(UTC) - timedelta(days=1),
    )
    active = Spool(
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
        printer_id=printer.id,
    )
    db.add(stale)
    db.add(active)
    db.commit()
    db.refresh(active)

    client = BambuClient()
    client.serial = printer.serial
    found = client._active_spool(db)

    assert found is not None
    assert found.id == active.id


def test_filament_stats_survive_deleting_the_spool(db: Session) -> None:
    from app import crud

    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Stats Test",
        color_hex="#123456",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    spool = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=700,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    job = PrintJob(
        title="Attribution test",
        weight=120,
        estimated_cost=3.5,
        filament_id=filament.id,
        spool_id=spool.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    db.add(
        PrintJobFilamentUsage(
            print_job_id=job.id,
            filament_id=filament.id,
            weight_g=120,
            cost=3.5,
        )
    )
    db.commit()

    before = crud.get_filament_stats(session=db, filament_id=filament.id)
    assert before.print_count == 1
    assert before.total_used_g == 120
    assert before.total_cost == 3.5

    db.delete(spool)
    db.commit()
    db.expire_all()

    after = crud.get_filament_stats(session=db, filament_id=filament.id)
    assert after.print_count == 1
    assert after.total_used_g == 120
    assert after.total_cost == 3.5
    assert after.spool_count == 0


def test_filament_stats_exclude_unknown_weight(db: Session) -> None:
    from app import crud

    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Unknown Stats",
        color_hex="#654321",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    known = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=700,
    )
    unknown = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=1000,
        remaining_unknown=True,
        source="ams",
    )
    db.add(known)
    db.add(unknown)
    db.commit()

    stats = crud.get_filament_stats(session=db, filament_id=filament.id)

    assert stats.spool_count == 2
    assert stats.remaining_g == 700
    assert stats.total_g == 1000
    assert stats.used_percent == 30.0


def test_updating_other_fields_keeps_an_unknown_weight(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Unknown Edit",
        color_hex="#ABCDEF",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    spool = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=1000,
        remaining_unknown=True,
        source="ams",
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    r = client.put(
        f"{settings.API_V1_STR}/spools/{spool.id}",
        headers=superuser_token_headers,
        json={"notes": "edited"},
    )
    assert r.status_code == 200, r.text
    db.expire_all()
    unchanged = db.get(Spool, spool.id)
    assert unchanged is not None
    assert unchanged.remaining_unknown is True

    r = client.put(
        f"{settings.API_V1_STR}/spools/{spool.id}",
        headers=superuser_token_headers,
        json={"remaining_g": 640},
    )
    assert r.status_code == 200, r.text
    db.expire_all()
    updated = db.get(Spool, spool.id)
    assert updated is not None
    assert updated.remaining_unknown is False
    assert updated.remaining_g == 640


def test_reducing_total_weight_of_an_unknown_spool_clamps_the_placeholder(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Unknown Capacity",
        color_hex="#FEDCBA",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    spool = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=1000,
        remaining_unknown=True,
        source="ams",
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    r = client.put(
        f"{settings.API_V1_STR}/spools/{spool.id}",
        headers=superuser_token_headers,
        json={"total_weight_g": 500},
    )
    assert r.status_code == 200, r.text

    db.expire_all()
    updated = db.get(Spool, spool.id)
    assert updated is not None
    assert updated.remaining_unknown is True
    assert updated.total_weight_g == 500
    assert updated.remaining_g == 500


def test_print_job_deduction_is_claimed_once(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    job = PrintJob(title="Claim test", device_id="claim-device", bambu_task_id="1")
    db.add(job)
    db.commit()
    db.refresh(job)

    client = BambuClient()
    assert client._claim_filament_deduction(db, job.id) is True
    db.commit()
    assert client._claim_filament_deduction(db, job.id) is False


def test_duplicate_print_job_is_rejected(db: Session) -> None:
    db.add(PrintJob(title="First", device_id="dup-device", bambu_task_id="2"))
    db.commit()

    db.add(PrintJob(title="Second", device_id="dup-device", bambu_task_id="2"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_activating_without_a_printer_is_rejected(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    spool = Spool(
        total_weight_g=1000,
        remaining_g=1000,
        active=False,
        printer_id=None,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    r = client.put(
        f"{settings.API_V1_STR}/spools/{spool.id}",
        headers=superuser_token_headers,
        json={"active": True},
    )

    assert r.status_code == 422
    db.expire_all()
    stored = db.get(Spool, spool.id)
    assert stored is not None
    assert stored.active is False


def test_saving_the_same_finish_twice_deducts_once(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Deduction Test",
        color_hex="#010203",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    spool = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
        printer_id=printer.id,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    job = PrintJob(
        title="Deduction test",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-deduct-1",
        spool_id=spool.id,
        filament_id=filament.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-deduct-1",
        "title": "Deduction test",
        "status": 3,
        "weight": 100,
        "costTime": 600,
        "startTime": None,
        "endTime": None,
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda task_id: task)

    client = BambuClient()
    client.serial = printer.serial
    client._save_print_job("task-deduct-1")
    client._save_print_job("task-deduct-1")

    db.expire_all()
    stored = db.get(Spool, spool.id)
    assert stored is not None
    assert stored.remaining_g == 900

    stored_job = db.get(PrintJob, job.id)
    assert stored_job is not None
    assert stored_job.filament_deducted_at is not None
    assert stored_job.weight == 100
    assert stored_job.filament_id == filament.id


def test_spool_rejects_remaining_above_total(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Overfill",
        color_hex="#123456",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    r = client.post(
        f"{settings.API_V1_STR}/spools/",
        headers=superuser_token_headers,
        json={
            "filament_id": str(filament.id),
            "total_weight_g": 1000,
            "remaining_g": 5000,
        },
    )
    assert r.status_code == 422

    spool = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=1000,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    r = client.put(
        f"{settings.API_V1_STR}/spools/{spool.id}",
        headers=superuser_token_headers,
        json={"remaining_g": 5000},
    )
    assert r.status_code == 422


def test_spool_rejects_null_weights(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    spool = Spool(total_weight_g=1000, remaining_g=1000)
    db.add(spool)
    db.commit()
    db.refresh(spool)

    r = client.put(
        f"{settings.API_V1_STR}/spools/{spool.id}",
        headers=superuser_token_headers,
        json={"remaining_g": None},
    )
    assert r.status_code == 422


def test_ams_slots_deduct_from_their_own_spools(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Two slots",
        color_hex="#102030",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    first = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="SLOT-A",
    )
    second = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="SLOT-B",
    )
    db.add(first)
    db.add(second)
    db.commit()
    db.refresh(first)
    db.refresh(second)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {
            "ams": [
                {
                    "id": 0,
                    "tray": [
                        {"id": 0, "tag_uid": "SLOT-A"},
                        {"id": 1, "tag_uid": "SLOT-B"},
                    ],
                }
            ]
        }
    }
    task = {
        "amsDetailMapping": [
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100},
            {"ams": 0, "slot": 1, "filamentId": "GFL99", "weight": 50},
        ]
    }
    client._deduct_filament_from_spools(db, task)
    db.commit()

    db.expire_all()
    stored_first = db.get(Spool, first.id)
    stored_second = db.get(Spool, second.id)
    assert stored_first is not None and stored_first.remaining_g == 900
    assert stored_second is not None and stored_second.remaining_g == 950


def test_ams_slot_does_not_charge_a_different_material(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    pla = Filament(
        brand="Test",
        material="PLA",
        color_name="PLA only",
        color_hex="#223344",
        bambu_info_idx="GFL99",
    )
    db.add(pla)
    db.commit()
    db.refresh(pla)

    spool = Spool(
        filament_id=pla.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    client = BambuClient()
    client.serial = printer.serial
    task = {
        "amsDetailMapping": [
            {"filamentId": "GFG99", "filamentType": "PETG", "weight": 100}
        ]
    }
    client._deduct_filament_from_spools(db, task)
    db.commit()

    db.expire_all()
    stored = db.get(Spool, spool.id)
    assert stored is not None
    assert stored.remaining_g == 1000


def test_one_spool_is_not_charged_for_two_slots(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="One spool",
        color_hex="#334455",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="ONLY-ONE",
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {"ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": "ONLY-ONE"}]}]}
    }
    task = {
        "amsDetailMapping": [
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100},
            {"ams": 0, "slot": 1, "filamentId": "GFL99", "weight": 100},
        ]
    }
    client._deduct_filament_from_spools(db, task)
    db.commit()

    db.expire_all()
    stored = db.get(Spool, spool.id)
    assert stored is not None
    assert stored.remaining_g == 900


def test_ams_second_slot_uses_the_next_untagged_spool(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Two untagged",
        color_hex="#556677",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    first = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
    )
    second = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
    )
    db.add(first)
    db.add(second)
    db.commit()
    db.refresh(first)
    db.refresh(second)

    client = BambuClient()
    client.serial = printer.serial
    task = {
        "amsDetailMapping": [
            {"filamentId": "GFL99", "weight": 100},
            {"filamentId": "GFL99", "weight": 50},
        ]
    }
    client._deduct_filament_from_spools(db, task)
    db.commit()

    db.expire_all()
    stored = sorted(
        [
            db.get(Spool, first.id).remaining_g,
            db.get(Spool, second.id).remaining_g,
        ]
    )
    assert stored == [900, 950]


def test_a_claimed_tag_does_not_fall_back_to_another_spool(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Tagged only",
        color_hex="#667788",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    tagged = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=950,
        tag_uid="TAG-ONE",
    )
    active = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=950,
        tag_uid="TAG-TWO",
        active=True,
    )
    db.add(tagged)
    db.add(active)
    db.commit()
    db.refresh(tagged)
    db.refresh(active)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {"ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": "TAG-ONE"}]}]}
    }
    task = {
        "amsDetailMapping": [
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100},
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100},
        ]
    }
    client._deduct_filament_from_spools(db, task)
    db.commit()

    db.expire_all()
    # Both mapping entries belong to the same tagged tray, so they are
    # charged to that roll; the other loaded spool is untouched.
    assert db.get(Spool, tagged.id).remaining_g == 750
    assert db.get(Spool, active.id).remaining_g == 950


def test_legacy_overfull_spool_can_still_be_repaired(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    spool = Spool(
        total_weight_g=1000,
        remaining_g=5000,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    # A notes-only patch must not re-check the legacy weight invariant.
    notes = client.put(
        f"{settings.API_V1_STR}/spools/{spool.id}",
        headers=superuser_token_headers,
        json={"notes": "legacy row"},
    )
    assert notes.status_code == 200, notes.text

    weights = client.put(
        f"{settings.API_V1_STR}/spools/{spool.id}",
        headers=superuser_token_headers,
        json={"remaining_g": 4000},
    )
    assert weights.status_code == 422


def test_ams_untagged_tray_does_not_charge_the_tagged_roll(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Mixed slots",
        color_hex="#778899",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    tagged = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="TAG-0",
    )
    untagged = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
    )
    db.add(tagged)
    db.add(untagged)
    db.commit()
    db.refresh(tagged)
    db.refresh(untagged)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {
            "ams": [
                {
                    "id": 0,
                    "tray": [
                        {"id": 0, "tag_uid": "TAG-0"},
                        {"id": 3, "tag_uid": "0000000000000000"},
                    ],
                }
            ]
        }
    }
    task = {
        "amsDetailMapping": [
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100},
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 50},
            {"ams": 0, "slot": 3, "filamentId": "GFL99", "weight": 50},
        ]
    }
    client._deduct_filament_from_spools(db, task)
    db.commit()

    db.expire_all()
    assert db.get(Spool, tagged.id).remaining_g == 850
    assert db.get(Spool, untagged.id).remaining_g == 950


def test_duplicate_untagged_mapping_entry_charges_one_spool(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="One untagged",
        color_hex="#8899AA",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {"ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": ""}]}]}
    }
    task = {
        "amsDetailMapping": [
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 50},
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 50},
        ]
    }
    client._deduct_filament_from_spools(db, task)
    db.commit()

    db.expire_all()
    assert db.get(Spool, spool.id).remaining_g == 900


def test_ams_omitted_tray_weight_matches_a_750g_filament(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    filament = Filament(
        brand="Bambu Lab",
        material="PLA",
        series="Support W",
        color_name="Support W",
        color_hex="#ffffff",
        spool_weight_g=750,
        bambu_info_idx=None,
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    client = BambuClient()
    found = client._ams_filament(
        db,
        {
            "tray_info_idx": "GFS00",
            "tray_type": "PLA",
            "tray_color": "FFFFFFFF",
            "tray_sub_brands": "Support W",
            "tray_id_name": "Support W",
        },
    )

    assert found.id == filament.id
    assert found.spool_weight_g == 750


def test_finish_keeps_the_spool_recorded_at_start(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    green = Filament(
        brand="Test",
        material="PLA",
        color_name="Start green",
        color_hex="#00ff00",
    )
    red = Filament(
        brand="Test",
        material="PLA",
        color_name="Finish red",
        color_hex="#ff0000",
    )
    db.add(green)
    db.add(red)
    db.commit()
    db.refresh(green)
    db.refresh(red)

    start_spool = Spool(
        filament_id=green.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(start_spool)
    db.commit()
    db.refresh(start_spool)

    job = PrintJob(
        title="Swap test",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-swap",
        spool_id=start_spool.id,
        filament_id=green.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    start_spool.active = False
    start_spool.printer_id = None
    current_spool = Spool(
        filament_id=red.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(current_spool)
    db.commit()

    task = {
        "id": "task-swap",
        "title": "Swap test",
        "status": 2,
        "weight": 10,
        "costTime": 60,
        "startTime": None,
        "endTime": "2026-11-11T10:00:00Z",
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._save_print_job("task-swap", "FINISH")

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.spool_id == start_spool.id
    assert stored.filament_id == green.id
    assert stored.status == 2


def test_finish_timeout_uses_the_printer_state(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Timeout spool",
        color_hex="#112233",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    job = PrintJob(
        title="Slow cloud",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-timeout",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-timeout",
        "title": "Slow cloud",
        "status": 4,
        "weight": 25,
        "costTime": 300,
        "startTime": None,
        "endTime": None,
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)
    monkeypatch.setattr("app.services.bambu_client.time.sleep", lambda _: None)

    client = BambuClient()
    client.serial = printer.serial
    client._save_print_job("task-timeout", "FINISH")

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 2
    assert stored.finished_at is not None
    # The payload still had status 4, so its per-slot weights were partial.
    assert stored.filament_deducted_at is None
    stored_spool = db.get(Spool, spool.id)
    assert stored_spool is not None
    assert stored_spool.remaining_g == 1000


def test_start_poll_accepts_printing_on_the_last_try(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    calls = {"count": 0}

    def fetch(_task_id: str) -> dict:
        calls["count"] += 1
        if calls["count"] <= 30:
            return {"id": "task-late", "status": 2}
        return {
            "id": "task-late",
            "title": "Late start",
            "status": 4,
            "weight": 5,
            "costTime": 60,
            "startTime": None,
            "amsDetailMapping": [],
        }

    monkeypatch.setattr(printer_service.cloud_client, "get_task", fetch)
    monkeypatch.setattr("app.services.bambu_client.time.sleep", lambda _: None)

    client = BambuClient()
    client.serial = printer.serial
    client._save_print_job_init("task-late")

    db.expire_all()
    stored = db.exec(
        select(PrintJob).where(PrintJob.bambu_task_id == "task-late")
    ).first()
    assert stored is not None
    assert stored.status == 4


def test_reconcile_closes_a_job_that_finished_offline(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    job = PrintJob(
        title="Offline finish",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-reconcile",
    )
    db.add(job)
    db.commit()

    client = BambuClient()
    client.serial = printer.serial
    monkeypatch.setattr(
        client,
        "_fetch_cloud_task",
        lambda _task_id: {"id": "task-reconcile", "status": 2},
    )
    saved: list[tuple[str | None, str | None]] = []
    monkeypatch.setattr(
        client,
        "_save_print_job",
        lambda task_id, state=None, task=None: saved.append((task_id, state)),
    )

    client._reconcile_open_jobs()

    assert saved == [("task-reconcile", "FINISH")]


def test_ams_reported_default_weight_still_matches_a_750g_series(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    filament = Filament(
        brand="Bambu Lab",
        material="PLA",
        series="Support W",
        color_name="Support W",
        color_hex="#ffffff",
        spool_weight_g=750,
        bambu_info_idx=None,
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    client = BambuClient()
    found = client._ams_filament(
        db,
        {
            "tray_info_idx": "GFS00",
            "tray_type": "PLA",
            "tray_color": "FFFFFFFF",
            "tray_sub_brands": "Support W",
            "tray_id_name": "Support W",
            "tray_weight": "1000",
        },
    )

    assert found.id == filament.id


def test_finish_without_an_open_job_does_not_create_or_deduct(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Ghost finish",
        color_hex="#445566",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    task = {
        "id": "task-ghost",
        "title": "Deleted by the user",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._save_print_job("task-ghost", "FINISH")

    db.expire_all()
    assert (
        db.exec(select(PrintJob).where(PrintJob.bambu_task_id == "task-ghost")).first()
        is None
    )
    stored = db.get(Spool, spool.id)
    assert stored is not None
    assert stored.remaining_g == 1000


def test_finish_with_a_missing_cloud_task_leaves_the_job_open(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    job = PrintJob(
        title="Cloud lag",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-missing",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: None)
    monkeypatch.setattr("app.services.bambu_client.time.sleep", lambda _: None)

    client = BambuClient()
    client.serial = printer.serial
    client._save_print_job("task-missing", "FINISH")

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 4
    assert stored.finished_at is None


def test_finish_defers_until_ams_state_arrives(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Deferred",
        color_hex="#667788",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)
    job = PrintJob(
        title="Deferred finish",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-deferred",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-deferred",
        "title": "Deferred finish",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100}
        ],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {}
    client._save_print_job("task-deferred", "FINISH")

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 4
    assert client._reconcile_on_ams is True
    stored_spool = db.get(Spool, spool.id)
    assert stored_spool is not None
    assert stored_spool.remaining_g == 1000


def test_reconcile_continues_after_one_task_fails(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    first = PrintJob(
        title="Broken",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-broken",
    )
    second = PrintJob(
        title="Healthy",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-healthy",
    )
    db.add(first)
    db.add(second)
    db.commit()
    db.refresh(first)
    db.refresh(second)

    def fetch(task_id: str) -> dict:
        if task_id == "task-broken":
            raise RuntimeError("cloud unavailable")
        return {
            "id": "task-healthy",
            "title": "Healthy",
            "status": 2,
            "weight": 10,
            "amsDetailMapping": [],
        }

    monkeypatch.setattr(printer_service.cloud_client, "get_task", fetch)

    client = BambuClient()
    client.serial = printer.serial
    client._reconcile_open_jobs()

    db.expire_all()
    assert db.get(PrintJob, first.id).status == 4  # type: ignore[union-attr]
    assert db.get(PrintJob, second.id).status == 2  # type: ignore[union-attr]


def test_ams_no_series_prefers_instead_of_filtering_weight(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    filament = Filament(
        brand="Unknown",
        material="PLA",
        color_name="No series 750",
        color_hex="#123abc",
        spool_weight_g=750,
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)

    client = BambuClient()
    found = client._ams_filament(
        db,
        {
            "tray_type": "PLA",
            "tray_color": "123ABC",
            "tray_weight": "1000",
        },
    )

    assert found.id == filament.id


def test_ams_pre_series_adopts_a_single_series_across_weights(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    legacy = Filament(
        brand="Bambu Lab",
        material="PLA",
        color_name="Legacy Matte",
        color_hex="#e8afcf",
        spool_weight_g=750,
    )
    db.add(legacy)
    db.commit()
    db.refresh(legacy)

    client = BambuClient()
    found = client._ams_filament(
        db,
        {
            "tray_info_idx": "GFA01",
            "tray_type": "PLA",
            "tray_color": "E8AFCF",
            "tray_sub_brands": "PLA Matte",
            "tray_weight": "1000",
        },
    )

    assert found.id == legacy.id
    assert found.series == "PLA Matte"


def test_ams_ambiguous_group_creates_a_new_filament(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    legacy = Filament(
        brand="Bambu Lab",
        material="Support",
        color_name="Legacy Support",
        color_hex="#ffffff",
        spool_weight_g=750,
    )
    db.add(legacy)
    db.commit()
    db.refresh(legacy)

    client = BambuClient()
    found = client._ams_filament(
        db,
        {
            "tray_info_idx": "GFS77",
            "tray_type": "Support",
            "tray_color": "FFFFFF",
            "tray_sub_brands": "Support G",
            "tray_weight": "1000",
        },
    )

    assert found.id != legacy.id
    assert found.series == "Support G"


def test_finish_recovers_a_lost_start_row(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Recovered start",
        color_hex="#123321",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    task = {
        "id": "task-recovered",
        "title": "Recovered start",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._remember_started_task("task-recovered")
    client._save_print_job("task-recovered", "FINISH")

    db.expire_all()
    job = db.exec(
        select(PrintJob).where(PrintJob.bambu_task_id == "task-recovered")
    ).one()
    assert job.status == 2
    assert job.filament_deducted_at is not None
    stored_spool = db.get(Spool, spool.id)
    assert stored_spool is not None
    assert stored_spool.remaining_g == 900


def test_a_forgotten_start_does_not_recreate_a_deleted_print(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Deleted print",
        color_hex="#321123",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    task = {
        "id": "task-deleted",
        "title": "Deleted print",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._remember_started_task("task-deleted")
    client.forget_started_task("task-deleted")
    client._save_print_job("task-deleted", "FINISH")

    db.expire_all()
    assert (
        db.exec(
            select(PrintJob).where(PrintJob.bambu_task_id == "task-deleted")
        ).first()
        is None
    )
    stored_spool = db.get(Spool, spool.id)
    assert stored_spool is not None
    assert stored_spool.remaining_g == 1000


def test_catalog_info_idx_prefers_the_same_weight(db: Session) -> None:
    from app.api.routes.spools import _find_or_create_catalog_filament

    light = Filament(
        brand="Test",
        material="ABS",
        series="ABS",
        color_name="Black 750",
        color_hex="#000000",
        spool_weight_g=750,
        bambu_info_idx="TEST-IDX-WEIGHT",
    )
    heavy = Filament(
        brand="Test",
        material="ABS",
        series="ABS",
        color_name="Black 1000",
        color_hex="#000000",
        spool_weight_g=1000,
        bambu_info_idx="TEST-IDX-WEIGHT",
    )
    db.add(light)
    db.add(heavy)
    db.commit()
    db.refresh(light)
    db.refresh(heavy)

    found = _find_or_create_catalog_filament(
        session=db,
        data={
            "brand": "Test",
            "material": "ABS",
            "color_hex": "#000000",
            "series": "ABS",
            "spool_weight_g": 1000,
            "bambu_info_idx": "TEST-IDX-WEIGHT",
        },
    )

    assert found.id == heavy.id
    db.expire_all()
    assert db.get(Filament, light.id).spool_weight_g == 750  # type: ignore[union-attr]
    assert db.get(Filament, heavy.id).spool_weight_g == 1000  # type: ignore[union-attr]


def test_catalog_info_idx_does_not_return_a_different_series(db: Session) -> None:
    from app.api.routes.spools import _find_or_create_catalog_filament

    other = Filament(
        brand="Test",
        material="ABS",
        series="ABS-GF",
        color_name="Other",
        color_hex="#111111",
        spool_weight_g=750,
        bambu_info_idx="TEST-IDX-SERIES",
    )
    expected = Filament(
        brand="Test",
        material="ABS",
        series="ABS",
        color_name="Expected",
        color_hex="#111111",
        spool_weight_g=750,
        bambu_info_idx="TEST-IDX-SERIES",
    )
    db.add(other)
    db.commit()
    db.refresh(other)
    db.add(expected)
    db.commit()
    db.refresh(expected)

    found = _find_or_create_catalog_filament(
        session=db,
        data={
            "brand": "Test",
            "material": "ABS",
            "color_hex": "#111111",
            "series": "ABS",
            "spool_weight_g": 750,
            "bambu_info_idx": "TEST-IDX-SERIES",
        },
    )

    assert found.id == expected.id
    db.expire_all()
    assert db.get(Filament, other.id).spool_weight_g == 750  # type: ignore[union-attr]


def test_lookup_commits_the_reconciled_weight(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    from app.models import FilamentBarcode

    existing = Filament(
        brand="Bambu Lab",
        material="PA",
        series="PA-CF",
        color_name="PA-CF",
        color_hex="#D7D7D7",
        spool_weight_g=1000,
    )
    db.add(existing)
    db.commit()
    db.refresh(existing)
    db.add(FilamentBarcode(code="6975337030423", filament_id=existing.id))
    db.commit()

    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": "6975337030423", "create": False},
    )
    assert r.status_code == 200, r.text
    assert r.json()["filament"]["spool_weight_g"] == 500

    db.expire_all()
    stored = db.get(Filament, existing.id)
    assert stored is not None
    assert stored.spool_weight_g == 500


def test_reconcile_retries_a_finished_undeducted_job(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Timeout retry",
        color_hex="#445566",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    job = PrintJob(
        title="Timeout retry",
        status=2,
        device_id=printer.serial,
        bambu_task_id="task-pending",
        finished_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-pending",
        "title": "Timeout retry",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._reconcile_open_jobs()

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.filament_deducted_at is not None
    stored_spool = db.get(Spool, spool.id)
    assert stored_spool is not None
    assert stored_spool.remaining_g == 900


def test_finish_deferral_is_bounded(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import MAX_FINISH_ATTEMPTS, BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    job = PrintJob(
        title="Deferred forever",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-bounded",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-bounded",
        "title": "Deferred forever",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100}
        ],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {}
    for _ in range(MAX_FINISH_ATTEMPTS):
        client._save_print_job("task-bounded", "FINISH")

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 2
    assert stored.finish_attempts == MAX_FINISH_ATTEMPTS
    assert stored.finish_state == "FINISH"
    assert stored.finished_at is not None
    assert stored.filament_deducted_at is None


def test_ams_no_series_ambiguous_group_creates_a_new_filament(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    legacy = Filament(
        brand="Bambu Lab",
        material="Support",
        color_name="Legacy Support",
        color_hex="#ffffff",
        spool_weight_g=1000,
    )
    db.add(legacy)
    db.commit()
    db.refresh(legacy)

    client = BambuClient()
    found = client._ams_filament(
        db,
        {
            "tray_info_idx": "GFS77",
            "tray_type": "Support",
            "tray_color": "FFFFFF",
            "tray_weight": "1000",
        },
    )

    assert found.id != legacy.id
    assert found.series is None


def test_failed_ams_sync_leaves_the_deduction_unclaimed(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Sync failure",
        color_hex="#556677",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)
    job = PrintJob(
        title="Sync failure",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-sync-fail",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-sync-fail",
        "title": "Sync failure",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100}
        ],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {"ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": "TAG-SYNC"}]}]}
    }
    monkeypatch.setattr(client, "_sync_ams_trays", lambda *args: False)
    client._save_print_job("task-sync-fail", "FINISH")

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 2
    assert stored.filament_deducted_at is None
    stored_spool = db.get(Spool, spool.id)
    assert stored_spool is not None
    assert stored_spool.remaining_g == 1000


def test_reconcile_does_not_close_a_running_print_with_a_missing_task(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    job = PrintJob(
        title="Still running",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-running",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: None)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {"gcode_state": "RUNNING"}
    client._reconcile_open_jobs()

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 4
    assert stored.finish_requested_at is None
    assert stored.finish_attempts == 0


def test_lookup_does_not_create_a_catalog_filament(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    from app.models import FilamentBarcode

    r = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=superuser_token_headers,
        json={"code": "6975337030157", "create": False},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["found"] is False
    assert body["suggested_filament"]["series"] == "PLA Matte"

    db.expire_all()
    assert (
        db.exec(
            select(FilamentBarcode).where(FilamentBarcode.code == "6975337030157")
        ).first()
        is None
    )


def test_nested_ams_payload_deducts_the_tagged_slot(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Nested AMS",
        color_hex="#102030",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="TAG-NESTED",
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)
    job = PrintJob(
        title="Nested AMS",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-nested",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-nested",
        "title": "Nested AMS",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100}
        ],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {
            "ams": [
                {
                    "id": 0,
                    "tray": [{"id": 0, "tag_uid": "TAG-NESTED"}],
                }
            ]
        }
    }
    client._save_print_job("task-nested", "FINISH")

    db.expire_all()
    stored = db.get(Spool, spool.id)
    assert stored is not None
    assert stored.remaining_g == 900
    stored_job = db.get(PrintJob, job.id)
    assert stored_job is not None
    assert stored_job.filament_deducted_at is not None


def test_reconcile_retries_a_stuck_finished_job(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Stuck retry",
        color_hex="#203040",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="TAG-STUCK",
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    mapping = [{"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100}]
    job = PrintJob(
        title="Stuck retry",
        status=2,
        device_id=printer.serial,
        bambu_task_id="task-stuck",
        finished_at=datetime.now(UTC) - timedelta(hours=8),
        weight=100,
        spool_id=spool.id,
        ams_detail_mapping=json.dumps(mapping),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-stuck",
        "status": 4,
        "weight": 100,
        "amsDetailMapping": mapping,
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {
            "ams": [
                {
                    "id": 0,
                    "tray": [{"id": 0, "tag_uid": "TAG-STUCK"}],
                }
            ]
        }
    }
    client._reconcile_open_jobs()

    db.expire_all()
    stored = db.get(Spool, spool.id)
    assert stored is not None
    assert stored.remaining_g == 900
    stored_job = db.get(PrintJob, job.id)
    assert stored_job is not None
    assert stored_job.filament_deducted_at is not None


def test_finish_with_a_missing_task_creates_a_placeholder(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: None)
    monkeypatch.setattr("app.services.bambu_client.time.sleep", lambda _: None)

    client = BambuClient()
    client.serial = printer.serial
    client._remember_started_task("task-lost-finish")
    client._save_print_job("task-lost-finish", "FINISH")

    db.expire_all()
    job = db.exec(
        select(PrintJob).where(PrintJob.bambu_task_id == "task-lost-finish")
    ).one()
    assert job.status == 4
    assert job.finish_requested_at is not None
    assert job.finish_attempts == 1


def test_reconcile_closes_a_stale_open_job_without_a_task(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    old = datetime.now(UTC) - timedelta(hours=25)
    job = PrintJob(
        title="Stale",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-stale",
        start_time=old,
        created_at=old,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: None)

    client = BambuClient()
    client.serial = printer.serial
    client._connected = True
    client._last_seen = time.monotonic()
    client._current_status = {"gcode_state": "IDLE"}
    client._reconcile_open_jobs()

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 2
    assert stored.finished_at is not None
    assert stored.finish_state == "FINISH"


def test_running_edge_clears_the_finish_budget(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    job = PrintJob(
        title="Retry",
        status=3,
        device_id=printer.serial,
        bambu_task_id="task-retry",
        finish_requested_at=datetime.now(UTC),
        finish_attempts=2,
        finish_state="FAILED",
        finished_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {"gcode_state": "PREPARE"}
    monkeypatch.setattr(client, "_on_print_started", lambda *args: None)

    client._handle_print_update({"gcode_state": "RUNNING", "task_id": "task-retry"})

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 4
    assert stored.finish_requested_at is None
    assert stored.finish_attempts == 0
    assert stored.finish_state is None
    assert stored.finished_at is None


def test_finish_is_ignored_while_the_printer_reports_running(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    job = PrintJob(
        title="Still running",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-running-finish",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-running-finish",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {"gcode_state": "RUNNING"}
    client._save_print_job("task-running-finish", "FINISH")

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 4
    assert stored.filament_deducted_at is None


def test_reconcile_defers_a_finish_without_ams(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    job = PrintJob(
        title="Deferred from reconcile",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-reconcile-defer",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-reconcile-defer",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [
            {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100}
        ],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {}
    client._reconcile_open_jobs()

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 4
    assert stored.finish_requested_at is not None
    assert stored.finish_attempts == 1


def test_finish_and_reconcile_race_deducts_once(db: Session, monkeypatch) -> None:
    from concurrent.futures import ThreadPoolExecutor

    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Race",
        color_hex="#304050",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)
    job = PrintJob(
        title="Race",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-race",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-race",
        "title": "Race",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(
            pool.map(
                lambda _: client._save_print_job("task-race", "FINISH"),
                range(2),
            )
        )

    db.expire_all()
    stored = db.get(Spool, spool.id)
    assert stored is not None
    assert stored.remaining_g == 900
    stored_job = db.get(PrintJob, job.id)
    assert stored_job is not None
    assert stored_job.filament_deducted_at is not None


def test_ams_series_prefers_the_reported_weight(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    light = Filament(
        brand="Bambu Lab",
        material="Support",
        series="Support W",
        color_name="Support W 750",
        color_hex="#ffffff",
        spool_weight_g=750,
        bambu_info_idx=None,
    )
    db.add(light)
    db.commit()
    db.refresh(light)
    heavy = Filament(
        brand="Bambu Lab",
        material="Support",
        series="Support W",
        color_name="Support W 1000",
        color_hex="#ffffff",
        spool_weight_g=1000,
        bambu_info_idx=None,
    )
    db.add(heavy)
    db.commit()
    db.refresh(heavy)

    client = BambuClient()
    found = client._ams_filament(
        db,
        {
            "tray_info_idx": "GFS76",
            "tray_type": "Support",
            "tray_color": "FFFFFF",
            "tray_sub_brands": "Support W",
            "tray_weight": "1000",
        },
    )

    assert found.id == heavy.id


def test_reconcile_does_not_close_a_running_job_as_stale(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    old = datetime.now(UTC) - timedelta(hours=25)
    job = PrintJob(
        title="Long running",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-long-running",
        start_time=old,
        created_at=old,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: None)

    client = BambuClient()
    client.serial = printer.serial
    client._connected = True
    client._last_seen = time.monotonic()
    client._current_status = {"gcode_state": "RUNNING"}
    client._reconcile_open_jobs()

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 4
    assert stored.finished_at is None


def _tagged_spool(db: Session, printer: Printer, filament: Filament, tag: str) -> Spool:
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid=tag,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)
    return spool


def test_delayed_retry_uses_the_recorded_spool_after_a_swap(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Swap proof",
        color_hex="#010203",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    roll_a = _tagged_spool(db, printer, filament, "ROLL-A")
    roll_b = _tagged_spool(db, printer, filament, "ROLL-B")

    mapping = [{"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 40}]
    job = PrintJob(
        title="Swap proof",
        status=2,
        device_id=printer.serial,
        bambu_task_id="task-swap-proof",
        finished_at=datetime.now(UTC),
        weight=40,
        spool_id=roll_a.id,
        ams_detail_mapping=json.dumps(mapping),
        deduction_spools=json.dumps({"0:0": str(roll_a.id)}),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-swap-proof",
        "status": 4,
        "weight": 40,
        "amsDetailMapping": mapping,
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    # The user swapped in roll B before the delayed retry.
    client._current_status = {
        "ams": {"ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": "ROLL-B"}]}]}
    }
    client._reconcile_open_jobs()

    db.expire_all()
    assert db.get(Spool, roll_a.id).remaining_g == 960  # type: ignore[union-attr]
    assert db.get(Spool, roll_b.id).remaining_g == 1000  # type: ignore[union-attr]
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.filament_deducted_at is not None


def test_delayed_retry_falls_back_to_the_start_spool_for_one_slot(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Single slot swap",
        color_hex="#020304",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    roll_a = _tagged_spool(db, printer, filament, "SINGLE-A")
    roll_b = _tagged_spool(db, printer, filament, "SINGLE-B")

    mapping = [{"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 25}]
    job = PrintJob(
        title="Single slot swap",
        status=2,
        device_id=printer.serial,
        bambu_task_id="task-single-swap",
        finished_at=datetime.now(UTC),
        weight=25,
        spool_id=roll_a.id,
        ams_detail_mapping=json.dumps(mapping),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-single-swap",
        "status": 4,
        "weight": 25,
        "amsDetailMapping": mapping,
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {"ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": "SINGLE-B"}]}]}
    }
    client._reconcile_open_jobs()

    db.expire_all()
    assert db.get(Spool, roll_a.id).remaining_g == 975  # type: ignore[union-attr]
    assert db.get(Spool, roll_b.id).remaining_g == 1000  # type: ignore[union-attr]


def test_timeout_persists_the_resolved_spool_map(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Timeout map",
        color_hex="#030405",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    roll_a = _tagged_spool(db, printer, filament, "TIMEOUT-A")

    mapping = [{"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 40}]
    job = PrintJob(
        title="Timeout map",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-timeout-map",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-timeout-map",
        "status": 4,
        "weight": 40,
        "amsDetailMapping": mapping,
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)
    monkeypatch.setattr("app.services.bambu_client.time.sleep", lambda _: None)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {"ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": "TIMEOUT-A"}]}]}
    }
    client._save_print_job("task-timeout-map", "FINISH")

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 2
    assert stored.filament_deducted_at is None
    assert stored.deduction_spools is not None
    assert str(roll_a.id) in stored.deduction_spools
    assert db.get(Spool, roll_a.id).remaining_g == 1000  # type: ignore[union-attr]


def test_finish_prefers_the_start_spool_for_a_single_slot(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Late finish",
        color_hex="#040506",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    roll_a = _tagged_spool(db, printer, filament, "LATE-A")
    roll_b = _tagged_spool(db, printer, filament, "LATE-B")

    mapping = [{"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 40}]
    job = PrintJob(
        title="Late finish",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-late-finish",
        spool_id=roll_a.id,
        filament_id=filament.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-late-finish",
        "title": "Late finish",
        "status": 2,
        "weight": 40,
        "amsDetailMapping": mapping,
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    # The tray already shows roll B when the finish report arrives.
    client._current_status = {
        "ams": {"ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": "LATE-B"}]}]}
    }
    client._save_print_job("task-late-finish", "FINISH")

    db.expire_all()
    assert db.get(Spool, roll_a.id).remaining_g == 960  # type: ignore[union-attr]
    assert db.get(Spool, roll_b.id).remaining_g == 1000  # type: ignore[union-attr]
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.deduction_spools is not None
    assert str(roll_a.id) in stored.deduction_spools


def test_unmapped_finish_charges_the_start_spool(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Unmapped finish",
        color_hex="#050607",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    start_spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(start_spool)
    db.commit()
    db.refresh(start_spool)

    job = PrintJob(
        title="Unmapped finish",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-unmapped",
        spool_id=start_spool.id,
        filament_id=filament.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # The user activates another spool before the finish arrives.
    start_spool.active = False
    start_spool.printer_id = None
    current_spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(current_spool)
    db.commit()
    db.refresh(current_spool)

    task = {
        "id": "task-unmapped",
        "title": "Unmapped finish",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._save_print_job("task-unmapped", "FINISH")

    db.expire_all()
    assert db.get(Spool, start_spool.id).remaining_g == 900  # type: ignore[union-attr]
    assert db.get(Spool, current_spool.id).remaining_g == 1000  # type: ignore[union-attr]


def test_persisted_unmapped_deduction_writes_filament_usage(db: Session) -> None:
    from app import crud
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Pending fallback",
        color_hex="#040506",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        price_per_kg=25.0,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)
    job = PrintJob(
        title="Pending fallback",
        status=2,
        device_id=printer.serial,
        bambu_task_id="task-pending",
        spool_id=spool.id,
        filament_id=filament.id,
        weight=100,
        # Deliberately different from the charged filament's price; the usage
        # row must be priced from the spool that was actually charged.
        estimated_cost=99.0,
        finished_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    client = BambuClient()
    client.serial = printer.serial
    client._deduct_persisted_job(
        "task-pending",
        {"id": "task-pending", "status": 2, "weight": 100, "amsDetailMapping": []},
    )

    db.expire_all()
    assert db.get(Spool, spool.id).remaining_g == 900  # type: ignore[union-attr]
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.filament_deducted_at is not None
    stats = crud.get_filament_stats(session=db, filament_id=filament.id)
    assert stats.print_count == 1
    assert stats.total_used_g == 100
    assert stats.total_cost == 2.5


def test_persist_filament_usage_upserts_the_same_filament(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Usage upsert",
        color_hex="#030405",
    )
    other = Filament(
        brand="Test",
        material="PETG",
        color_name="Usage replace",
        color_hex="#020304",
    )
    db.add(filament)
    db.add(other)
    db.commit()
    db.refresh(filament)
    db.refresh(other)
    job = PrintJob(
        title="Usage upsert",
        device_id=printer.serial,
        bambu_task_id="task-upsert",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    client = BambuClient()
    client._persist_filament_usage(
        db, job, {str(filament.id): {"weight": 10, "cost": 1.0}}
    )
    db.commit()
    # A second finish/reconcile pass must update the row, not violate the
    # unique constraint.
    client._persist_filament_usage(
        db, job, {str(filament.id): {"weight": 20, "cost": 2.0}}
    )
    db.commit()
    rows = db.exec(
        select(PrintJobFilamentUsage).where(
            PrintJobFilamentUsage.print_job_id == job.id
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].weight_g == 20
    assert rows[0].cost == 2.0

    # Changing the attributed filament replaces the stale row.
    client._persist_filament_usage(db, job, {str(other.id): {"weight": 5, "cost": 0.5}})
    db.commit()
    db.expire_all()
    rows = db.exec(
        select(PrintJobFilamentUsage).where(
            PrintJobFilamentUsage.print_job_id == job.id
        )
    ).all()
    assert [row.filament_id for row in rows] == [other.id]


def test_partial_mapping_is_retried_instead_of_claimed(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament_a = Filament(
        brand="Test",
        material="PLA",
        color_name="Partial A",
        color_hex="#060708",
        bambu_info_idx="GFL99",
    )
    db.add(filament_a)
    db.commit()
    db.refresh(filament_a)
    roll_a = Spool(
        filament_id=filament_a.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="PART-A",
    )
    db.add(roll_a)
    db.commit()
    db.refresh(roll_a)

    mapping = [
        {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 60},
        {"ams": 0, "slot": 1, "filamentId": "GFX99", "weight": 40},
    ]
    job = PrintJob(
        title="Partial mapping",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-partial",
        spool_id=roll_a.id,
        filament_id=filament_a.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-partial",
        "title": "Partial mapping",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": mapping,
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {
            "ams": [
                {
                    "id": 0,
                    "tray": [
                        {"id": 0, "tag_uid": "PART-A"},
                        {"id": 1, "tag_uid": "0000000000000000"},
                    ],
                }
            ]
        }
    }
    client._save_print_job("task-partial", "FINISH")

    db.expire_all()
    stored_job = db.get(PrintJob, job.id)
    assert stored_job is not None
    assert stored_job.filament_deducted_at is None
    assert db.get(Spool, roll_a.id).remaining_g == 1000  # type: ignore[union-attr]

    # The missing slot becomes resolvable; the retry must deduct both.
    filament_b = Filament(
        brand="Test",
        material="PLA",
        color_name="Partial B",
        color_hex="#070809",
        bambu_info_idx="GFX99",
    )
    db.add(filament_b)
    db.commit()
    db.refresh(filament_b)
    roll_b = Spool(
        filament_id=filament_b.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="PART-B",
    )
    db.add(roll_b)
    db.commit()
    db.refresh(roll_b)

    client._current_status = {
        "ams": {
            "ams": [
                {
                    "id": 0,
                    "tray": [
                        {"id": 0, "tag_uid": "PART-A"},
                        {"id": 1, "tag_uid": "PART-B"},
                    ],
                }
            ]
        }
    }
    # The cloud task has caught up with no mapping; the stored mapping
    # and the newly resolvable tray must still be used.
    client._deduct_persisted_job(
        "task-partial", {"id": "task-partial", "status": 2, "amsDetailMapping": []}
    )

    db.expire_all()
    assert db.get(Spool, roll_a.id).remaining_g == 940  # type: ignore[union-attr]
    assert db.get(Spool, roll_b.id).remaining_g == 960  # type: ignore[union-attr]
    stored_job = db.get(PrintJob, job.id)
    assert stored_job is not None
    assert stored_job.filament_deducted_at is not None


def test_finish_uses_the_ams_synced_remaining_weight(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="AMS overwrite",
        color_hex="#08090a",
        bambu_info_idx="GFL99",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="AMS-SYNC",
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)

    mapping = [{"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100}]
    job = PrintJob(
        title="AMS overwrite",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-ams-sync",
        spool_id=spool.id,
        filament_id=filament.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-ams-sync",
        "title": "AMS overwrite",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": mapping,
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {
            "ams": [
                {
                    "id": 0,
                    "tray": [
                        {
                            "id": 0,
                            "tag_uid": "AMS-SYNC",
                            "tray_weight": "1000",
                            "remain": "60",
                        }
                    ],
                }
            ]
        }
    }
    client._save_print_job("task-ams-sync", "FINISH")

    db.expire_all()
    stored = db.get(Spool, spool.id)
    assert stored is not None
    # AMS writes 600, then the finish deducts 100 from that value.
    assert stored.remaining_g == 500


def test_finish_is_kept_while_another_task_runs(db: Session, monkeypatch) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Back to back",
        color_hex="#090a0b",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)
    job = PrintJob(
        title="Task A",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-a",
        spool_id=spool.id,
        filament_id=filament.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-a",
        "title": "Task A",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {"gcode_state": "RUNNING", "task_id": "task-b"}
    client._save_print_job("task-a", "FINISH")

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 2
    assert stored.filament_deducted_at is not None
    assert db.get(Spool, spool.id).remaining_g == 900  # type: ignore[union-attr]


def test_reconcile_closes_a_stale_job_with_a_stuck_status_4_task(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    old = datetime.now(UTC) - timedelta(hours=25)
    job = PrintJob(
        title="Stuck task",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-stuck-4",
        start_time=old,
        created_at=old,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    monkeypatch.setattr(
        printer_service.cloud_client,
        "get_task",
        lambda _: {"id": "task-stuck-4", "status": 4},
    )

    client = BambuClient()
    client.serial = printer.serial
    client._connected = True
    client._last_seen = time.monotonic()
    client._current_status = {"gcode_state": "IDLE"}
    client._reconcile_open_jobs()

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 2
    assert stored.finished_at is not None


def test_reconcile_closes_a_stale_running_job_once_the_printer_is_offline(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    old = datetime.now(UTC) - timedelta(hours=25)
    job = PrintJob(
        title="Offline mid print",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-offline",
        start_time=old,
        created_at=old,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: None)

    client = BambuClient()
    client.serial = printer.serial
    client._connected = False
    client._last_seen = time.monotonic() - 3600
    client._current_status = {"gcode_state": "RUNNING"}
    client._reconcile_open_jobs()
    db.expire_all()
    assert db.get(PrintJob, job.id).status == 4  # type: ignore[union-attr]

    client._reconcile_open_jobs()
    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 2
    assert stored.finished_at is not None


def test_ams_info_idx_respects_the_reported_series(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    abs_row = Filament(
        brand="Bambu Lab",
        material="ABS",
        series="ABS",
        color_name="ABS",
        color_hex="#112233",
        spool_weight_g=1000,
        bambu_info_idx="GFTEST-SERIES",
    )
    db.add(abs_row)
    db.commit()
    db.refresh(abs_row)
    abs_gf = Filament(
        brand="Bambu Lab",
        material="ABS",
        series="ABS-GF",
        color_name="ABS-GF",
        color_hex="#112233",
        spool_weight_g=1000,
        bambu_info_idx="GFTEST-SERIES",
    )
    db.add(abs_gf)
    db.commit()
    db.refresh(abs_gf)

    client = BambuClient()
    found = client._ams_filament(
        db,
        {
            "tray_info_idx": "GFTEST-SERIES",
            "tray_type": "ABS",
            "tray_color": "112233",
            "tray_sub_brands": "ABS",
            "tray_weight": "1000",
        },
    )

    assert found.id == abs_row.id


def test_update_spool_rejects_a_duplicate_tag(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Duplicate tag",
        color_hex="#0a0b0c",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    first = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="DUPLICATE-TAG",
    )
    second = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="OTHER-TAG",
    )
    db.add(first)
    db.add(second)
    db.commit()
    db.refresh(second)

    r = client.put(
        f"{settings.API_V1_STR}/spools/{second.id}",
        headers=superuser_token_headers,
        json={"tag_uid": "DUPLICATE-TAG"},
    )
    assert r.status_code == 409


def test_put_active_unloads_the_other_spool(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Put active",
        color_hex="#0b0c0d",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    first = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    second = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
    )
    db.add(first)
    db.add(second)
    db.commit()
    db.refresh(first)
    db.refresh(second)

    r = client.put(
        f"{settings.API_V1_STR}/spools/{second.id}",
        headers=superuser_token_headers,
        json={"active": True},
    )
    assert r.status_code == 200, r.text

    db.expire_all()
    assert db.get(Spool, second.id).active is True  # type: ignore[union-attr]
    assert db.get(Spool, first.id).active is False  # type: ignore[union-attr]


def test_multi_material_print_attributes_each_filament(
    db: Session, monkeypatch
) -> None:
    from app import crud
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    pla = Filament(
        brand="Test",
        material="PLA",
        color_name="Usage PLA",
        color_hex="#0c0d0e",
        bambu_info_idx="GFL99",
    )
    petg = Filament(
        brand="Test",
        material="PETG",
        color_name="Usage PETG",
        color_hex="#0d0e0f",
        bambu_info_idx="GFP99",
    )
    db.add(pla)
    db.add(petg)
    db.commit()
    db.refresh(pla)
    db.refresh(petg)
    roll_a = Spool(
        filament_id=pla.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="USAGE-A",
        price_per_kg=20,
    )
    roll_b = Spool(
        filament_id=petg.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="USAGE-B",
        price_per_kg=40,
    )
    db.add(roll_a)
    db.add(roll_b)
    db.commit()
    db.refresh(roll_a)
    db.refresh(roll_b)

    mapping = [
        {"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 60},
        {"ams": 0, "slot": 1, "filamentId": "GFP99", "weight": 40},
    ]
    job = PrintJob(
        title="Two colours",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-two-colours",
        spool_id=roll_a.id,
        filament_id=pla.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-two-colours",
        "title": "Two colours",
        "status": 2,
        "weight": 100,
        "amsDetailMapping": mapping,
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {
            "ams": [
                {
                    "id": 0,
                    "tray": [
                        {"id": 0, "tag_uid": "USAGE-A"},
                        {"id": 1, "tag_uid": "USAGE-B"},
                    ],
                }
            ]
        }
    }
    client._save_print_job("task-two-colours", "FINISH")

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    usage = json.loads(stored.filament_usage or "{}")
    assert usage[str(pla.id)]["weight"] == 60
    assert usage[str(petg.id)]["weight"] == 40
    assert usage[str(pla.id)]["cost"] == 1.2
    assert usage[str(petg.id)]["cost"] == 1.6
    assert stored.estimated_cost == 2.8

    pla_stats = crud.get_filament_stats(session=db, filament_id=pla.id)
    petg_stats = crud.get_filament_stats(session=db, filament_id=petg.id)
    assert pla_stats.print_count == 1
    assert pla_stats.total_used_g == 60
    assert pla_stats.total_cost == 1.2
    assert petg_stats.print_count == 1
    assert petg_stats.total_used_g == 40
    assert petg_stats.total_cost == 1.6


def test_reconcile_keeps_a_long_print_through_a_short_mqtt_stall(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    old = datetime.now(UTC) - timedelta(hours=30)
    job = PrintJob(
        title="Long print",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-long-print",
        start_time=old,
        created_at=old,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: None)

    client = BambuClient()
    client.serial = printer.serial
    client._connected = True
    client._last_seen = time.monotonic() - 120
    client._current_status = {
        "gcode_state": "RUNNING",
        "task_id": "task-long-print",
    }
    client._reconcile_open_jobs()

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 4


def test_reconcile_needs_two_offline_passes_to_close_a_running_job(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    old = datetime.now(UTC) - timedelta(hours=30)
    job = PrintJob(
        title="Offline long print",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-offline-long",
        start_time=old,
        created_at=old,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: None)

    client = BambuClient()
    client.serial = printer.serial
    client._connected = False
    client._last_seen = time.monotonic() - 7200
    client._current_status = {"gcode_state": "RUNNING"}

    client._reconcile_open_jobs()
    db.expire_all()
    assert db.get(PrintJob, job.id).status == 4  # type: ignore[union-attr]

    client._reconcile_open_jobs()
    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 2


def test_persisted_deleted_roll_is_not_replaced_by_the_live_tray(
    db: Session,
) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    filament_a = Filament(
        brand="Test",
        material="PLA",
        color_name="Deleted roll",
        color_hex="#111111",
    )
    filament_b = Filament(
        brand="Test",
        material="PLA",
        color_name="Replacement roll",
        color_hex="#222222",
    )
    db.add(filament_a)
    db.add(filament_b)
    db.commit()
    db.refresh(filament_a)
    db.refresh(filament_b)

    roll_a = Spool(
        filament_id=filament_a.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
    )
    roll_b = Spool(
        filament_id=filament_b.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="NEW-ROLL",
    )
    db.add(roll_a)
    db.add(roll_b)
    db.commit()
    db.refresh(roll_a)
    db.refresh(roll_b)

    mapping = [{"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 100}]
    job = PrintJob(
        title="Deleted roll",
        status=2,
        device_id=printer.serial,
        bambu_task_id="task-deleted-roll",
        spool_id=roll_a.id,
        filament_id=filament_a.id,
        ams_detail_mapping=json.dumps(mapping),
        deduction_spools=json.dumps({"0:0": str(roll_a.id)}),
        finished_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # The roll recorded at finish is deleted; a different roll now sits in
    # the tray.
    db.delete(roll_a)
    db.commit()

    client = BambuClient()
    client.serial = printer.serial
    client._current_status = {
        "ams": {"ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": "NEW-ROLL"}]}]}
    }
    client._deduct_persisted_job(
        "task-deleted-roll",
        {
            "id": "task-deleted-roll",
            "status": 2,
            "weight": 100,
            "amsDetailMapping": mapping,
        },
    )

    db.expire_all()
    assert db.get(Spool, roll_b.id).remaining_g == 1000  # type: ignore[union-attr]
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.filament_deducted_at is None


def test_persisted_deduction_waits_for_a_running_task(db: Session) -> None:
    from app.services.bambu_client import BambuClient

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Still running",
        color_hex="#333333",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        tag_uid="STILL-RUNNING",
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)
    mapping = [{"ams": 0, "slot": 0, "filamentId": "GFL99", "weight": 40}]
    job = PrintJob(
        title="Still running",
        status=2,
        device_id=printer.serial,
        bambu_task_id="task-still-running",
        spool_id=spool.id,
        filament_id=filament.id,
        ams_detail_mapping=json.dumps(mapping),
        deduction_spools=json.dumps({"0:0": str(spool.id)}),
        finished_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    client = BambuClient()
    client.serial = printer.serial
    client._deduct_persisted_job(
        "task-still-running",
        {
            "id": "task-still-running",
            "status": 4,
            "weight": 100,
            "amsDetailMapping": mapping,
        },
    )

    db.expire_all()
    assert db.get(Spool, spool.id).remaining_g == 1000  # type: ignore[union-attr]
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.filament_deducted_at is None


def test_finish_without_an_end_time_still_gets_finished_at(
    db: Session, monkeypatch
) -> None:
    from app.services.bambu_client import BambuClient
    from app.services.printer_service import printer_service

    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="No end time",
        color_hex="#444444",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    spool = Spool(
        filament_id=filament.id,
        total_weight_g=1000,
        remaining_g=1000,
    )
    db.add(spool)
    db.commit()
    db.refresh(spool)
    job = PrintJob(
        title="No end time",
        status=4,
        device_id=printer.serial,
        bambu_task_id="task-no-end",
        spool_id=spool.id,
        filament_id=filament.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    task = {
        "id": "task-no-end",
        "title": "No end time",
        "status": 2,
        "weight": 10,
        "endTime": 0,
        "amsDetailMapping": [],
    }
    monkeypatch.setattr(printer_service.cloud_client, "get_task", lambda _: task)

    client = BambuClient()
    client.serial = printer.serial
    client._save_print_job("task-no-end", "FINISH")

    db.expire_all()
    stored = db.get(PrintJob, job.id)
    assert stored is not None
    assert stored.status == 2
    assert stored.finished_at is not None
    assert stored.finished_at.year >= 2025


def test_activating_another_spool_keeps_the_first_loaded(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    printer = _create_printer(db)
    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Two loaded",
        color_hex="#555555",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    first = Spool(filament_id=filament.id, total_weight_g=1000, remaining_g=1000)
    second = Spool(filament_id=filament.id, total_weight_g=1000, remaining_g=1000)
    db.add(first)
    db.add(second)
    db.commit()
    db.refresh(first)
    db.refresh(second)

    for spool in (first, second):
        r = client.put(
            f"{settings.API_V1_STR}/spools/{spool.id}/activate",
            headers=superuser_token_headers,
            json={"printer_id": str(printer.id)},
        )
        assert r.status_code == 200, r.text

    db.expire_all()
    first_stored = db.get(Spool, first.id)
    second_stored = db.get(Spool, second.id)
    assert first_stored is not None
    assert second_stored is not None
    assert first_stored.printer_id == printer.id
    assert first_stored.active is False
    assert second_stored.printer_id == printer.id
    assert second_stored.active is True


def test_average_price_ignores_zero_priced_spools(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    from app import crud

    filament = Filament(
        brand="Test",
        material="PLA",
        color_name="Zero price",
        color_hex="#666666",
    )
    db.add(filament)
    db.commit()
    db.refresh(filament)
    db.add(
        Spool(
            filament_id=filament.id,
            total_weight_g=1000,
            remaining_g=1000,
            price_per_kg=20.0,
        )
    )
    db.add(
        Spool(
            filament_id=filament.id,
            total_weight_g=1000,
            remaining_g=1000,
            price_per_kg=0.0,
        )
    )
    db.commit()

    stats = crud.get_filament_stats(session=db, filament_id=filament.id)
    assert stats.avg_price_per_kg == 20.0

    r = client.get(f"{settings.API_V1_STR}/filaments/", headers=superuser_token_headers)
    assert r.status_code == 200, r.text
    row = next(item for item in r.json()["data"] if item["id"] == str(filament.id))
    assert row["avg_price_per_kg"] == 20.0

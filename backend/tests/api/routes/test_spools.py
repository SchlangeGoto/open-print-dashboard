import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Filament, Printer, PrintJob, Spool


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

    job = db.exec(
        select(PrintJob).where(PrintJob.bambu_task_id == "task-deduct-1")
    ).one()
    assert job.filament_deducted_at is not None
    assert job.weight == 100
    # The production finish path writes the denormalised attribution.
    assert job.filament_id == filament.id


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
        "ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": "ONLY-ONE"}]}]
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

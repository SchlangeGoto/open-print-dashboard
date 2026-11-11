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
        "ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": "TAG-ONE"}]}]
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
    client._current_status = {"ams": [{"id": 0, "tray": [{"id": 0, "tag_uid": ""}]}]}
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


def test_catalog_info_idx_does_not_rewrite_a_different_series(db: Session) -> None:
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
    db.add(other)
    db.commit()
    db.refresh(other)

    found = _find_or_create_catalog_filament(
        session=db,
        data={
            "brand": "Test",
            "material": "ABS",
            "color_hex": "#111111",
            "series": "ABS",
            "spool_weight_g": 1000,
            "bambu_info_idx": "TEST-IDX-SERIES",
        },
    )

    assert found.id == other.id
    db.expire_all()
    assert db.get(Filament, other.id).spool_weight_g == 750  # type: ignore[union-attr]


def test_lookup_commits_the_reconciled_weight(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
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

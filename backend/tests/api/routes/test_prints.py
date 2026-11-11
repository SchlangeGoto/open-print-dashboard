from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import PrintJob


def _clear_jobs(db: Session) -> None:
    for job in db.exec(select(PrintJob)).all():
        db.delete(job)
    db.commit()


def test_stats_ignores_running_jobs(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _clear_jobs(db)
    now = datetime.now(UTC)
    db.add(PrintJob(title="Still running", status=4, start_time=now))
    db.add(
        PrintJob(
            title="Last finished",
            status=2,
            start_time=now,
            finished_at=now,
        )
    )
    db.commit()

    response = client.get(
        f"{settings.API_V1_STR}/prints/stats", headers=superuser_token_headers
    )

    assert response.status_code == 200, response.text
    assert response.json()["title"] == "Last finished"


def test_stats_is_null_when_nothing_finished(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _clear_jobs(db)
    db.add(
        PrintJob(
            title="Only a running print",
            status=4,
            start_time=datetime.now(UTC),
        )
    )
    db.commit()

    response = client.get(
        f"{settings.API_V1_STR}/prints/stats", headers=superuser_token_headers
    )

    assert response.status_code == 200, response.text
    assert response.json() is None


def test_list_active_and_delete_prints(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _clear_jobs(db)
    now = datetime.now(UTC)
    running = PrintJob(title="Running now", status=4, start_time=now)
    finished = PrintJob(title="Older job", status=2, start_time=now, finished_at=now)
    db.add(running)
    db.add(finished)
    db.commit()
    db.refresh(running)
    db.refresh(finished)
    finished_id = finished.id

    listed = client.get(
        f"{settings.API_V1_STR}/prints/", headers=superuser_token_headers
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["count"] == 2
    # Running jobs have a NULL finished_at and must come last.
    assert listed.json()["data"][0]["title"] == "Older job"

    active = client.get(
        f"{settings.API_V1_STR}/prints/active", headers=superuser_token_headers
    )
    assert active.status_code == 200, active.text
    assert [job["title"] for job in active.json()["data"]] == ["Running now"]

    deleted = client.delete(
        f"{settings.API_V1_STR}/prints/{finished_id}",
        headers=superuser_token_headers,
    )
    assert deleted.status_code == 200, deleted.text
    db.expire_all()
    assert db.get(PrintJob, finished_id) is None


def test_prints_rejects_invalid_pagination(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    for query in ("skip=-1", "limit=0", "limit=1001"):
        r = client.get(
            f"{settings.API_V1_STR}/prints/?{query}",
            headers=superuser_token_headers,
        )
        assert r.status_code == 422, query


def test_deleting_a_print_forgets_the_started_task(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
    monkeypatch,
) -> None:
    from app.services.printer_service import printer_service

    _clear_jobs(db)
    job = PrintJob(
        title="Delete hook",
        status=4,
        device_id="hook-serial",
        bambu_task_id="hook-task",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    forgotten: list[str] = []

    class FakeClient:
        def forget_started_task(self, task_id: str) -> None:
            forgotten.append(task_id)

    monkeypatch.setattr(
        printer_service,
        "get_client",
        lambda serial: FakeClient() if serial == "hook-serial" else None,
    )

    r = client.delete(
        f"{settings.API_V1_STR}/prints/{job.id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200, r.text
    assert forgotten == ["hook-task"]

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

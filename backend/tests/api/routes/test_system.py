import fcntl
import os
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.routes import system
from app.core.config import settings


def test_update_status_reports_available_release(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "APP_VERSION", "1.2.3")
    monkeypatch.setattr(settings, "UPDATER_DIR", tmp_path)
    monkeypatch.setattr(
        system, "_latest_release", lambda: ("1.3.0", "https://example/release")
    )

    response = client.get(
        f"{settings.API_V1_STR}/system/update", headers=superuser_token_headers
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["current_version"] == "1.2.3"
    assert data["latest_version"] == "1.3.0"
    assert data["update_available"] is True
    assert data["updater_available"] is False


def test_update_request_requires_the_sidecar(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "UPDATER_DIR", tmp_path)

    response = client.post(
        f"{settings.API_V1_STR}/system/update",
        headers=superuser_token_headers,
        json={"tag": "1.3.0"},
    )
    assert response.status_code == 503


def test_update_request_is_written_once(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "UPDATER_DIR", tmp_path)
    monkeypatch.setattr(settings, "APP_VERSION", "1.2.3")
    monkeypatch.setattr(system, "_latest_release", lambda: ("1.3.0", None))
    (tmp_path / "request").mkdir()
    (tmp_path / "ready").touch()
    (tmp_path / "heartbeat").touch()
    (tmp_path / "status").write_text("state=idle\n")

    response = client.post(
        f"{settings.API_V1_STR}/system/update",
        headers=superuser_token_headers,
        json={"tag": "v1.3.0"},
    )
    assert response.status_code == 200, response.text
    assert (tmp_path / "request" / "request").read_text().strip() == "1.3.0"

    duplicate = client.post(
        f"{settings.API_V1_STR}/system/update",
        headers=superuser_token_headers,
        json={"tag": "1.3.0"},
    )
    assert duplicate.status_code == 409


def test_update_request_reclaims_an_abandoned_reservation(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "UPDATER_DIR", tmp_path)
    monkeypatch.setattr(settings, "APP_VERSION", "1.2.3")
    monkeypatch.setattr(system, "_latest_release", lambda: ("1.3.0", None))
    (tmp_path / "request").mkdir()
    (tmp_path / "ready").touch()
    (tmp_path / "heartbeat").touch()
    (tmp_path / "status").write_text("state=idle\n")

    response = client.post(
        f"{settings.API_V1_STR}/system/update",
        headers=superuser_token_headers,
        json={"tag": "1.3.0"},
    )
    assert response.status_code == 200, response.text
    assert (tmp_path / "request" / "queued").exists()

    # The worker has not consumed the request yet: the marker blocks a second
    # publish even though the first publisher already released its lock.
    duplicate = client.post(
        f"{settings.API_V1_STR}/system/update",
        headers=superuser_token_headers,
        json={"tag": "1.3.0"},
    )
    assert duplicate.status_code == 409

    # No request and no lock with an unlocked marker is a publisher that died
    # before publishing. The next request may reclaim the marker.
    (tmp_path / "request" / "request").unlink()
    reclaimed = client.post(
        f"{settings.API_V1_STR}/system/update",
        headers=superuser_token_headers,
        json={"tag": "1.3.0"},
    )
    assert reclaimed.status_code == 200, reclaimed.text
    assert (tmp_path / "request" / "request").read_text().strip() == "1.3.0"


def test_update_request_waits_for_a_live_publisher(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "UPDATER_DIR", tmp_path)
    monkeypatch.setattr(settings, "APP_VERSION", "1.2.3")
    (tmp_path / "request").mkdir()
    (tmp_path / "ready").touch()
    (tmp_path / "heartbeat").touch()
    (tmp_path / "status").write_text("state=idle\n")

    marker = tmp_path / "request" / "queued"
    fd = os.open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    try:
        # A publisher that is slow but alive holds the lock; its marker must
        # not be stolen or reclaimed.
        blocked = client.post(
            f"{settings.API_V1_STR}/system/update",
            headers=superuser_token_headers,
            json={"tag": "1.3.0"},
        )
        assert blocked.status_code == 409
        assert not (tmp_path / "request" / "request").exists()
    finally:
        os.close(fd)

    # Once the publisher is gone the kernel released the lock and the marker
    # can be reclaimed.
    allowed = client.post(
        f"{settings.API_V1_STR}/system/update",
        headers=superuser_token_headers,
        json={"tag": "1.3.0"},
    )
    assert allowed.status_code == 200, allowed.text
    assert (tmp_path / "request" / "request").read_text().strip() == "1.3.0"


def test_update_request_rejects_a_blocked_updater(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "UPDATER_DIR", tmp_path)
    monkeypatch.setattr(settings, "APP_VERSION", "1.2.3")
    (tmp_path / "request").mkdir()
    (tmp_path / "ready").touch()
    (tmp_path / "heartbeat").touch()
    (tmp_path / "status").write_text(
        "state=blocked\nmessage=Manual intervention required\n"
    )

    response = client.post(
        f"{settings.API_V1_STR}/system/update",
        headers=superuser_token_headers,
        json={"tag": "1.3.0"},
    )
    assert response.status_code == 409
    assert not (tmp_path / "request" / "request").exists()
    assert not (tmp_path / "request" / "queued").exists()


def test_update_request_rejects_an_invalid_tag(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "UPDATER_DIR", tmp_path)
    (tmp_path / "ready").touch()

    response = client.post(
        f"{settings.API_V1_STR}/system/update",
        headers=superuser_token_headers,
        json={"tag": "1.3.0; reboot"},
    )
    assert response.status_code == 422


def test_update_endpoints_require_a_superuser(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/system/update",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 403

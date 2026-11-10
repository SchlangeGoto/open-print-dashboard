from fastapi.testclient import TestClient

from app.core.config import settings


def test_public_status_does_not_leak_bambu_or_printer_state(
    client: TestClient,
) -> None:
    r = client.get(f"{settings.API_V1_STR}/setup/status")

    assert r.status_code == 200
    assert set(r.json()) == {"user_created", "setup_complete"}


def test_progress_requires_auth(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/setup/progress")

    assert r.status_code == 401


def test_progress_returns_the_step_state(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/setup/progress",
        headers=superuser_token_headers,
    )

    assert r.status_code == 200
    data = r.json()
    assert data["user_created"] is True
    assert set(data) == {
        "user_created",
        "bambu_logged_in",
        "printer_configured",
        "setup_complete",
    }

import threading
from collections.abc import Callable
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.api.routes import bambu as bambu_routes
from app.api.routes.bambu import (
    BambuLoginRequest,
    BambuVerifyRequest,
    delete_session,
    login_start,
    login_verify,
)
from app.core.config import settings
from app.services.bambu_cloud import is_allowed_cover_url
from app.services.printer_service import printer_service


def test_cover_url_allowlist() -> None:
    assert is_allowed_cover_url("https://public-cdn.bblmw.com/cover/a.jpg")
    assert is_allowed_cover_url("https://makerworld.bblmw.com/cover/a.jpg")
    assert is_allowed_cover_url("https://bambulab.com/cover/a.jpg")

    assert not is_allowed_cover_url("http://169.254.169.254/latest/meta-data")
    assert not is_allowed_cover_url("http://127.0.0.1:8000/api/v1/users/me")
    assert not is_allowed_cover_url("https://bblmw.com.evil.example/a.jpg")
    assert not is_allowed_cover_url("https://evil.example/bblmw.com/a.jpg")
    assert not is_allowed_cover_url("file:///etc/passwd")


def test_cover_endpoint_refuses_foreign_hosts(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    url = quote("http://169.254.169.254/latest/meta-data", safe="")

    response = client.get(
        f"{settings.API_V1_STR}/printers/cover/{url}",
        headers=superuser_token_headers,
    )

    assert response.status_code == 404


def test_bambu_session_delete_clears_credentials(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    crud.save_cloud_token(session=db, token="test-token")
    crud.save_cloud_credentials(session=db, email="user@example.com", password="secret")

    response = client.delete(
        f"{settings.API_V1_STR}/bambu/session", headers=superuser_token_headers
    )

    assert response.status_code == 200, response.text
    db.expire_all()
    assert crud.get_cloud_token(session=db) is None
    assert crud.get_cloud_credentials(session=db) == {
        "email": None,
        "password": None,
    }


def _sign_out_wins_over(
    monkeypatch: pytest.MonkeyPatch, db: Session, action: Callable[[], object]
) -> None:
    """Start an auth action, pause it, and sign out concurrently.

    Sign-out must wait for the paused action and then clear everything.
    Without the lock it clears first, and the resumed action re-saves the
    credentials, so the final state assertions fail.
    """
    entered = threading.Event()
    release = threading.Event()
    cleared = threading.Event()
    lock_attempted = threading.Event()
    lock_blocked = threading.Event()
    errors: list[BaseException] = []

    def fake_login(code: str | None = None) -> None:
        entered.set()
        if not release.wait(5):
            raise TimeoutError("login was never released")
        printer_service.cloud_client.token = "race-token"
        printer_service.cloud_client.email = "race@example.com"
        printer_service.cloud_client.password = "secret"

    original_clear = crud.clear_cloud_credentials

    def tracking_clear(*, session: Session) -> None:
        original_clear(session=session)
        cleared.set()

    # Probe the real lock from the sign-out thread. This turns "sign-out
    # waited" into an explicit event instead of a timing guess.
    real_lock = printer_service.auth_lock()

    class ProbeLock:
        def __enter__(self) -> "ProbeLock":
            if threading.current_thread().name == "bambu-sign-out":
                lock_attempted.set()
                if not real_lock.acquire(blocking=False):
                    lock_blocked.set()
                    real_lock.acquire()
            else:
                real_lock.acquire()
            return self

        def __exit__(self, *exc_info: object) -> None:
            real_lock.release()

    printer_service.cloud_client.reset_session()
    crud.clear_cloud_credentials(session=db)
    monkeypatch.setattr(printer_service.cloud_client, "login", fake_login)
    monkeypatch.setattr(printer_service.cloud_client, "is_token_valid", lambda: False)
    monkeypatch.setattr(printer_service, "reload", lambda: None)
    monkeypatch.setattr(crud, "clear_cloud_credentials", tracking_clear)
    monkeypatch.setattr(printer_service, "auth_lock", lambda: ProbeLock())

    def run_action() -> None:
        try:
            action()
        except BaseException as exc:  # noqa: BLE001 - reported to the test
            errors.append(exc)

    def run_sign_out() -> None:
        try:
            delete_session(session=db)
        except BaseException as exc:  # noqa: BLE001 - reported to the test
            errors.append(exc)

    action_thread = threading.Thread(target=run_action)
    sign_out_thread = threading.Thread(target=run_sign_out, name="bambu-sign-out")
    action_thread.start()
    assert entered.wait(5)
    sign_out_thread.start()
    # Sign-out must reach the shared lock and block while the paused login
    # holds it. A missing lock fails here instead of depending on scheduling.
    assert lock_attempted.wait(5)
    assert lock_blocked.wait(5)
    assert not cleared.is_set()
    release.set()
    action_thread.join(5)
    sign_out_thread.join(5)
    assert not action_thread.is_alive()
    assert not sign_out_thread.is_alive()
    assert errors == []
    assert cleared.is_set()
    assert printer_service.cloud_client.token is None
    assert printer_service.cloud_client.email is None
    assert printer_service.cloud_client.password is None
    db.expire_all()
    assert crud.get_cloud_token(session=db) is None
    assert crud.get_cloud_credentials(session=db) == {
        "email": None,
        "password": None,
    }


@pytest.mark.parametrize(
    ("action", "is_reauth"),
    [
        pytest.param(
            lambda: login_start(
                BambuLoginRequest(email="race@example.com", password="secret")
            ),
            False,
            id="login",
        ),
        pytest.param(
            lambda: login_verify(BambuVerifyRequest(code="123456")),
            False,
            id="verify",
        ),
        pytest.param(
            lambda: printer_service.reauthenticate(),
            True,
            id="reauthenticate",
        ),
    ],
)
def test_sign_out_waits_for_a_paused_auth_action(
    monkeypatch: pytest.MonkeyPatch,
    db: Session,
    action: Callable[[], object],
    is_reauth: bool,
) -> None:
    if is_reauth:
        printer_service._last_reauth_at = None

    def wrapped() -> None:
        bambu_routes._pending_login = True
        action()

    _sign_out_wins_over(monkeypatch, db, wrapped)
    bambu_routes._pending_login = False

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.core.security import (
    generate_refresh_token,
    hash_refresh_token,
    verify_password,
)
from app.models import RefreshToken, UserCreate
from app.utils import generate_password_reset_token
from tests.utils.utils import (
    TEST_SUPERUSER_EMAIL,
    TEST_SUPERUSER_PASSWORD,
    random_email,
    random_lower_string,
)


def login(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": email, "password": password},
    )
    assert r.status_code == 200
    return r.json()


def test_get_access_token(client: TestClient) -> None:
    tokens = login(client, TEST_SUPERUSER_EMAIL, TEST_SUPERUSER_PASSWORD)
    assert tokens["access_token"]
    assert tokens["refresh_token"]
    assert tokens["token_type"] == "bearer"
    assert tokens["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


def test_refresh_token_rotates(client: TestClient) -> None:
    tokens = login(client, TEST_SUPERUSER_EMAIL, TEST_SUPERUSER_PASSWORD)

    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert r.status_code == 200
    refreshed = r.json()
    assert refreshed["refresh_token"] != tokens["refresh_token"]
    assert refreshed["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

    r = client.post(
        f"{settings.API_V1_STR}/login/test-token",
        headers={"Authorization": f"Bearer {refreshed['access_token']}"},
    )
    assert r.status_code == 200


def test_refresh_token_reuse_is_detected(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    tokens = login(client, TEST_SUPERUSER_EMAIL, TEST_SUPERUSER_PASSWORD)
    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    rotated = r.json()

    monkeypatch.setattr(settings, "REFRESH_TOKEN_REUSE_GRACE_SECONDS", 0)
    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert r.status_code == 401
    assert "reuse" in r.json()["detail"].lower()

    # Reuse detection revokes the rotation chain, so the latest token is dead.
    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": rotated["refresh_token"]},
    )
    assert r.status_code == 401


def test_refresh_token_reuse_within_grace_keeps_session(
    client: TestClient,
) -> None:
    tokens = login(client, TEST_SUPERUSER_EMAIL, TEST_SUPERUSER_PASSWORD)
    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    rotated = r.json()

    # An immediate retry of the old token is rejected but must not kill the
    # rotated session.
    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert r.status_code == 401
    assert "already rotated" in r.json()["detail"].lower()

    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": rotated["refresh_token"]},
    )
    assert r.status_code == 200


def test_refresh_token_after_logout(client: TestClient) -> None:
    tokens = login(client, TEST_SUPERUSER_EMAIL, TEST_SUPERUSER_PASSWORD)

    r = client.post(
        f"{settings.API_V1_STR}/login/logout",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert r.status_code == 200
    assert r.json() == {"message": "Logged out"}

    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert r.status_code == 401


def test_expired_refresh_token_is_rejected(client: TestClient, db: Session) -> None:
    user = crud.get_user_by_email(session=db, email=TEST_SUPERUSER_EMAIL)
    assert user
    raw_token = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
        )
    )
    db.commit()

    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": raw_token},
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "Refresh token expired"


def test_refresh_token_invalid(client: TestClient) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": "not-a-real-token"},
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid refresh token"


def test_get_access_token_incorrect_password(client: TestClient) -> None:
    login_data = {"username": TEST_SUPERUSER_EMAIL, "password": "wrong"}
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    assert r.status_code == 400


def test_use_access_token(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/login/test-token", headers=superuser_token_headers
    )
    result = r.json()
    assert r.status_code == 200
    assert "email" in result


def test_recovery_password_user_exists(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/password-recovery/{settings.EMAIL_TEST_USER}",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 200
    assert r.json() == {
        "message": "If that email is registered, we sent a password recovery link"
    }


def test_recovery_password_user_not_exists(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/password-recovery/jVgQr@example.com",
        headers=normal_user_token_headers,
    )
    # Should return 200 with a generic message to prevent email enumeration.
    assert r.status_code == 200
    assert r.json() == {
        "message": "If that email is registered, we sent a password recovery link"
    }


def test_reset_password(client: TestClient, db: Session) -> None:
    email = random_email()
    password = random_lower_string()
    new_password = random_lower_string()

    crud.create_user(
        session=db,
        user_create=UserCreate(email=email, password=password, full_name="Test User"),
    )
    token = generate_password_reset_token(email=email)
    data = {"new_password": new_password, "token": token}

    r = client.post(f"{settings.API_V1_STR}/reset-password/", json=data)
    assert r.status_code == 200
    assert r.json() == {"message": "Password updated successfully"}

    user = crud.get_user_by_email(session=db, email=email)
    assert user
    verified, _ = verify_password(new_password, user.hashed_password)
    assert verified


def test_reset_password_revokes_refresh_tokens(client: TestClient, db: Session) -> None:
    email = random_email()
    password = random_lower_string()
    new_password = random_lower_string()
    crud.create_user(
        session=db,
        user_create=UserCreate(email=email, password=password, full_name="Test User"),
    )
    tokens = login(client, email, password)

    token = generate_password_reset_token(email=email)
    r = client.post(
        f"{settings.API_V1_STR}/reset-password/",
        json={"new_password": new_password, "token": token},
    )
    assert r.status_code == 200

    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert r.status_code == 401


def test_reset_password_invalid_token(client: TestClient) -> None:
    data = {"new_password": "changethis", "token": "invalid"}
    r = client.post(f"{settings.API_V1_STR}/reset-password/", json=data)
    response = r.json()
    assert "detail" in response
    assert r.status_code == 400
    assert response["detail"] == "Invalid token"


def test_expired_reused_token_still_triggers_reuse_detection(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    tokens = login(client, TEST_SUPERUSER_EMAIL, TEST_SUPERUSER_PASSWORD)
    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    rotated = r.json()

    # A rotated token that also expired is still evidence of reuse.
    db.expire_all()
    row = db.exec(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(tokens["refresh_token"])
        )
    ).first()
    assert row is not None
    row.expires_at = datetime.now(UTC) - timedelta(days=1)
    db.add(row)
    db.commit()

    monkeypatch.setattr(settings, "REFRESH_TOKEN_REUSE_GRACE_SECONDS", 0)
    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert r.status_code == 401
    assert "reuse" in r.json()["detail"].lower()

    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": rotated["refresh_token"]},
    )
    assert r.status_code == 401


def test_access_token_is_rejected_after_a_password_change(
    client: TestClient, db: Session
) -> None:
    email = random_email()
    password = random_lower_string()
    new_password = random_lower_string()
    crud.create_user(
        session=db,
        user_create=UserCreate(email=email, password=password),
    )

    tokens = login(client, email, password)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    me = f"{settings.API_V1_STR}/users/me"
    assert client.get(me, headers=headers).status_code == 200

    reset_token = generate_password_reset_token(email=email)
    r = client.post(
        f"{settings.API_V1_STR}/reset-password/",
        json={"new_password": new_password, "token": reset_token},
    )
    assert r.status_code == 200

    # The old access token was issued before sessions_revoked_at.
    assert client.get(me, headers=headers).status_code == 401

    new_tokens = login(client, email, new_password)
    new_headers = {"Authorization": f"Bearer {new_tokens['access_token']}"}
    assert client.get(me, headers=new_headers).status_code == 200

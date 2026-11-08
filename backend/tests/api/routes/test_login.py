from datetime import UTC, datetime, timedelta

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


def test_refresh_token_reuse_revokes_all_sessions(client: TestClient) -> None:
    first = login(client, TEST_SUPERUSER_EMAIL, TEST_SUPERUSER_PASSWORD)
    second = login(client, TEST_SUPERUSER_EMAIL, TEST_SUPERUSER_PASSWORD)

    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": first["refresh_token"]},
    )
    assert r.status_code == 200
    rotated = r.json()

    # Replaying the already-rotated token triggers reuse detection.
    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": first["refresh_token"]},
    )
    assert r.status_code == 401
    assert "reuse" in r.json()["detail"].lower()

    # Every session, including the latest rotation and the second login, dies.
    for token in (rotated["refresh_token"], second["refresh_token"]):
        r = client.post(
            f"{settings.API_V1_STR}/login/refresh",
            json={"refresh_token": token},
        )
        assert r.status_code == 401


def test_logout_keeps_other_sessions_alive(client: TestClient) -> None:
    first = login(client, TEST_SUPERUSER_EMAIL, TEST_SUPERUSER_PASSWORD)
    second = login(client, TEST_SUPERUSER_EMAIL, TEST_SUPERUSER_PASSWORD)

    r = client.post(
        f"{settings.API_V1_STR}/login/logout",
        json={"refresh_token": first["refresh_token"]},
    )
    assert r.status_code == 200

    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": second["refresh_token"]},
    )
    assert r.status_code == 200


def test_refresh_tokens_are_stored_hashed(
    client: TestClient, db: Session
) -> None:
    tokens = login(client, TEST_SUPERUSER_EMAIL, TEST_SUPERUSER_PASSWORD)
    user = crud.get_user_by_email(session=db, email=TEST_SUPERUSER_EMAIL)
    assert user

    stored = db.exec(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.token_hash == hash_refresh_token(tokens["refresh_token"]),
        )
    ).first()
    assert stored
    assert stored.token_hash != tokens["refresh_token"]


def test_invalid_access_token_returns_401_challenge(
    client: TestClient,
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/users/me",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"


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


def test_expired_refresh_token_is_rejected(
    client: TestClient, db: Session
) -> None:
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
        user_create=UserCreate(
            email=email, password=password, full_name="Test User"
        ),
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


def test_reset_password_revokes_refresh_tokens(
    client: TestClient, db: Session
) -> None:
    email = random_email()
    password = random_lower_string()
    new_password = random_lower_string()
    crud.create_user(
        session=db,
        user_create=UserCreate(
            email=email, password=password, full_name="Test User"
        ),
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


def test_admin_password_change_revokes_refresh_tokens(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    email = random_email()
    password = random_lower_string()
    new_password = random_lower_string()
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=email, password=password, full_name="Test User"
        ),
    )
    tokens = login(client, email, password)

    r = client.patch(
        f"{settings.API_V1_STR}/users/{user.id}",
        headers=superuser_token_headers,
        json={"password": new_password},
    )
    assert r.status_code == 200

    r = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert r.status_code == 401
    login(client, email, new_password)


def test_self_password_change_revokes_refresh_tokens(
    client: TestClient, db: Session
) -> None:
    email = random_email()
    password = random_lower_string()
    new_password = random_lower_string()
    crud.create_user(
        session=db,
        user_create=UserCreate(
            email=email, password=password, full_name="Test User"
        ),
    )
    tokens = login(client, email, password)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    r = client.patch(
        f"{settings.API_V1_STR}/users/me/password",
        headers=headers,
        json={"current_password": password, "new_password": new_password},
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

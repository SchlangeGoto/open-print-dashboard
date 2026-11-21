from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import UserCreate
from tests.utils.utils import random_email, random_lower_string


def test_get_users_superuser_me(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(f"{settings.API_V1_STR}/users/me", headers=superuser_token_headers)
    current_user = r.json()
    assert current_user
    assert current_user["is_active"] is True
    assert current_user["is_superuser"] is True


def test_get_users_normal_user_me(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.get(f"{settings.API_V1_STR}/users/me", headers=normal_user_token_headers)
    current_user = r.json()
    assert current_user
    assert current_user["is_active"] is True
    assert current_user["is_superuser"] is False
    assert current_user["email"] == settings.EMAIL_TEST_USER


def test_create_user_new_email(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    email = random_email()
    password = random_lower_string()
    data = {"email": email, "password": password}
    r = client.post(
        f"{settings.API_V1_STR}/users/", headers=superuser_token_headers, json=data
    )
    assert 200 <= r.status_code < 300
    created_user = r.json()
    user = crud.get_user_by_email(session=db, email=email)
    assert user
    assert user.email == created_user["email"]


def test_create_user_existing_email(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    email = random_email()
    password = random_lower_string()
    crud.create_user(
        session=db,
        user_create=UserCreate(email=email, password=password),
    )
    data = {"email": email, "password": password}
    r = client.post(
        f"{settings.API_V1_STR}/users/", headers=superuser_token_headers, json=data
    )
    assert r.status_code == 400


def test_get_existing_user(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    email = random_email()
    password = random_lower_string()
    user = crud.create_user(
        session=db,
        user_create=UserCreate(email=email, password=password),
    )
    r = client.get(
        f"{settings.API_V1_STR}/users/{user.id}", headers=superuser_token_headers
    )
    assert r.status_code == 200
    assert r.json()["email"] == email


def test_normal_user_cannot_list_users(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.get(f"{settings.API_V1_STR}/users/", headers=normal_user_token_headers)

    assert r.status_code == 403


def test_deactivating_a_user_revokes_every_session(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    email = random_email()
    password = random_lower_string()
    user = crud.create_user(
        session=db, user_create=UserCreate(email=email, password=password)
    )

    login = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": email, "password": password},
    )
    assert login.status_code == 200, login.text
    tokens = login.json()
    session_headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert (
        client.get(
            f"{settings.API_V1_STR}/users/me", headers=session_headers
        ).status_code
        == 200
    )

    deactivated = client.patch(
        f"{settings.API_V1_STR}/users/{user.id}",
        headers=superuser_token_headers,
        json={"is_active": False},
    )
    assert deactivated.status_code == 200, deactivated.text

    # Both the stateless access token and the rotating refresh token die now.
    # While disabled the API returns "Inactive user"; after re-activation the
    # revoked access token is rejected with 401.
    assert client.get(
        f"{settings.API_V1_STR}/users/me", headers=session_headers
    ).status_code in (400, 401)
    refresh = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert refresh.status_code == 401, refresh.text

    # Re-activation must not resurrect the old refresh token.
    reactivated = client.patch(
        f"{settings.API_V1_STR}/users/{user.id}",
        headers=superuser_token_headers,
        json={"is_active": True},
    )
    assert reactivated.status_code == 200, reactivated.text
    reuse = client.post(
        f"{settings.API_V1_STR}/login/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert reuse.status_code == 401, reuse.text

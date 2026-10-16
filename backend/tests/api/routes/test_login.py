from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.core.security import verify_password
from app.models import UserCreate
from app.utils import generate_password_reset_token
from tests.utils.user import user_authentication_headers
from tests.utils.utils import (
    TEST_SUPERUSER_EMAIL,
    TEST_SUPERUSER_PASSWORD,
    random_email,
    random_lower_string,
)


def test_get_access_token(client: TestClient) -> None:
    login_data = {
        "username": TEST_SUPERUSER_EMAIL,
        "password": TEST_SUPERUSER_PASSWORD,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    assert r.status_code == 200
    assert "access_token" in tokens
    assert tokens["access_token"]


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


def test_reset_password_invalid_token(client: TestClient) -> None:
    data = {"new_password": "changethis", "token": "invalid"}
    r = client.post(f"{settings.API_V1_STR}/reset-password/", json=data)
    response = r.json()
    assert "detail" in response
    assert r.status_code == 400
    assert response["detail"] == "Invalid token"

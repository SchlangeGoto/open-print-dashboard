from urllib.parse import quote

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.services.bambu_cloud import is_allowed_cover_url


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

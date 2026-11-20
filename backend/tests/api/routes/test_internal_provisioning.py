import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.core.tenancy import DEFAULT_TENANT_ID
from app.models import UserCreate
from tests.utils.utils import random_email, random_lower_string

TOKEN = "test-provisioning-token"


def _headers(token: str = TOKEN) -> dict[str, str]:
    return {"X-Provisioning-Token": token}


def _payload(slug: str, owner_email: str | None = None) -> dict[str, str]:
    return {
        "name": slug.title(),
        "slug": slug,
        "owner_email": owner_email or random_email(),
    }


def _provision(client: TestClient, slug: str, key: str | None = None, **kwargs) -> dict:
    response = client.post(
        f"{settings.API_V1_STR}/internal/tenants",
        headers={
            **_headers(),
            "Idempotency-Key": key or uuid.uuid4().hex,
        },
        json=_payload(slug, **kwargs),
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_internal_api_requires_the_service_token(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "PROVISIONING_TOKEN", TOKEN)

    missing = client.post(
        f"{settings.API_V1_STR}/internal/tenants",
        headers={"Idempotency-Key": "missing-token"},
        json=_payload("missing-token"),
    )
    wrong = client.post(
        f"{settings.API_V1_STR}/internal/tenants",
        headers={**_headers("wrong"), "Idempotency-Key": "wrong-token"},
        json=_payload("wrong-token"),
    )

    assert missing.status_code == 401, missing.text
    assert wrong.status_code == 401, wrong.text


def test_internal_api_is_disabled_without_configuration(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "PROVISIONING_TOKEN", None)

    response = client.get(
        f"{settings.API_V1_STR}/internal/tenants/{uuid.uuid4()}",
        headers=_headers(),
    )

    assert response.status_code == 404, response.text


def test_provisioning_is_idempotent(
    client: TestClient, db: Session, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "PROVISIONING_TOKEN", TOKEN)
    key = uuid.uuid4().hex

    first = _provision(client, "idempotent", key=key)
    second = _provision(client, "idempotent", key=key)

    assert first["created"] is True
    assert second["created"] is False
    assert first["tenant"]["id"] == second["tenant"]["id"]
    assert first["invite_url"].startswith(settings.FRONTEND_HOST)
    assert "token=" in first["invite_url"]

    tenant = crud.get_tenant_by_external_id(session=db, external_id=key)
    assert tenant is not None
    assert tenant.slug == "idempotent"


def test_provisioning_uses_an_existing_account_as_owner(
    client: TestClient, db: Session, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "PROVISIONING_TOKEN", TOKEN)
    email = random_email()
    user = crud.create_user(
        session=db,
        user_create=UserCreate(email=email, password=random_lower_string()),
    )

    result = _provision(client, "existing-owner", owner_email=email)

    assert result["invite_url"] is None
    membership = crud.get_membership(
        session=db,
        tenant_id=uuid.UUID(result["tenant"]["id"]),
        user_id=user.id,
    )
    assert membership is not None
    assert membership.role == "owner"


def test_internal_tenant_lifecycle(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "PROVISIONING_TOKEN", TOKEN)
    result = _provision(client, "lifecycle")
    tenant_id = result["tenant"]["id"]

    health = client.get(
        f"{settings.API_V1_STR}/internal/tenants/{tenant_id}/health",
        headers=_headers(),
    )
    assert health.status_code == 200, health.text
    assert health.json()["printers_configured"] == 0

    deactivated = client.patch(
        f"{settings.API_V1_STR}/internal/tenants/{tenant_id}",
        headers=_headers(),
        json={"is_active": False},
    )
    assert deactivated.status_code == 200, deactivated.text
    assert deactivated.json()["is_active"] is False

    health = client.get(
        f"{settings.API_V1_STR}/internal/tenants/{tenant_id}/health",
        headers=_headers(),
    )
    assert health.status_code == 200, health.text
    assert health.json()["is_active"] is False

    default = client.patch(
        f"{settings.API_V1_STR}/internal/tenants/{DEFAULT_TENANT_ID}",
        headers=_headers(),
        json={"is_active": False},
    )
    assert default.status_code == 400, default.text


def test_internal_api_requires_an_idempotency_key(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "PROVISIONING_TOKEN", TOKEN)

    response = client.post(
        f"{settings.API_V1_STR}/internal/tenants",
        headers=_headers(),
        json=_payload("no-key"),
    )

    assert response.status_code == 422, response.text


def test_internal_api_rejects_unknown_tenants(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "PROVISIONING_TOKEN", TOKEN)
    tenant_id = uuid.uuid4()

    read = client.get(
        f"{settings.API_V1_STR}/internal/tenants/{tenant_id}",
        headers=_headers(),
    )
    update = client.patch(
        f"{settings.API_V1_STR}/internal/tenants/{tenant_id}",
        headers=_headers(),
        json={"is_active": True},
    )

    assert read.status_code == 404, read.text
    assert update.status_code == 404, update.text

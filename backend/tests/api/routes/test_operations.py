from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.core.tenancy import DEFAULT_TENANT_ID
from app.models import Tenant, UserCreate
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


def _tenant(db: Session, slug: str) -> Tenant:
    tenant = Tenant(name=slug.title(), slug=slug)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


def _member(
    db: Session, tenant: Tenant, role: str, email: str | None = None
) -> tuple[str, str]:
    email = email or random_email()
    password = random_lower_string()
    user = crud.create_user(
        session=db, user_create=UserCreate(email=email, password=password)
    )
    crud.ensure_membership(session=db, tenant_id=tenant.id, user_id=user.id, role=role)
    return email, password


def _headers(
    client: TestClient, db: Session, tenant: Tenant, role: str = "owner"
) -> tuple[dict[str, str], str]:
    email, password = _member(db, tenant, role)
    headers = user_authentication_headers(client=client, email=email, password=password)
    headers["X-Tenant-ID"] = str(tenant.id)
    return headers, email


def test_tenant_health_reports_the_current_tenant(
    client: TestClient, db: Session
) -> None:
    tenant = _tenant(db, "health")
    headers, _ = _headers(client, db, tenant)

    response = client.get(
        f"{settings.API_V1_STR}/tenants/current/health", headers=headers
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["tenant_id"] == str(tenant.id)
    assert data["bambu_connected"] is False
    assert data["printers_configured"] == 0
    assert data["printers_connected"] == 0


def test_audit_log_records_actions_and_is_tenant_scoped(
    client: TestClient, db: Session
) -> None:
    tenant = _tenant(db, "audit")
    other = _tenant(db, "audit-other")
    headers, _ = _headers(client, db, tenant)

    created = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=headers,
        json={"name": "Audit printer", "serial": "audit-serial"},
    )
    assert created.status_code == 200, created.text
    client.post(f"{settings.API_V1_STR}/setup/skip", headers=headers)

    other_headers, _ = _headers(client, db, other)
    other_printer = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=other_headers,
        json={"name": "Other printer", "serial": "other-audit"},
    )
    assert other_printer.status_code == 200, other_printer.text

    response = client.get(
        f"{settings.API_V1_STR}/tenants/current/audit", headers=headers
    )
    assert response.status_code == 200, response.text
    actions = {item["action"] for item in response.json()["data"]}
    assert {"printer.create", "setup.skip"} <= actions
    targets = {item["target"] for item in response.json()["data"]}
    assert "other-audit" not in targets


def test_audit_log_requires_a_tenant_admin(client: TestClient, db: Session) -> None:
    tenant = _tenant(db, "audit-viewer")
    headers, _ = _headers(client, db, tenant, role="viewer")

    response = client.get(
        f"{settings.API_V1_STR}/tenants/current/audit", headers=headers
    )

    assert response.status_code == 403, response.text


def test_printer_quota(client: TestClient, db: Session, monkeypatch) -> None:
    tenant = _tenant(db, "printer-quota")
    headers, _ = _headers(client, db, tenant)
    monkeypatch.setattr(settings, "TENANT_MAX_PRINTERS", 1)

    first = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=headers,
        json={"name": "First", "serial": "quota-first"},
    )
    second = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=headers,
        json={"name": "Second", "serial": "quota-second"},
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 409, second.text


def test_user_quota(client: TestClient, db: Session, monkeypatch) -> None:
    tenant = _tenant(db, "user-quota")
    headers, email = _headers(client, db, tenant)
    monkeypatch.setattr(settings, "TENANT_MAX_USERS", 1)

    response = client.post(
        f"{settings.API_V1_STR}/tenants/current/invites",
        headers=headers,
        json={"email": random_email(), "role": "viewer"},
    )

    assert response.status_code == 409, response.text
    assert response.json()["detail"] == "Tenant user quota reached"
    assert email


def test_tenant_export_omits_cloud_secrets(client: TestClient, db: Session) -> None:
    tenant = _tenant(db, "export")
    headers, owner_email = _headers(client, db, tenant)
    crud.save_cloud_credentials(
        session=db,
        email="secret@example.com",
        password="secret-password",
        tenant_id=tenant.id,
    )
    crud.save_cloud_token(session=db, token="secret-token", tenant_id=tenant.id)

    response = client.get(
        f"{settings.API_V1_STR}/tenants/current/export", headers=headers
    )

    assert response.status_code == 200, response.text
    body = response.text
    assert owner_email in body
    assert "secret@example.com" not in body
    assert "secret-password" not in body
    assert "secret-token" not in body
    data = response.json()
    assert data["tenant"]["slug"] == tenant.slug
    assert data["members"][0]["email"] == owner_email


def test_tenant_rate_limit_is_per_tenant(
    client: TestClient, db: Session, monkeypatch
) -> None:
    tenant = _tenant(db, "rate-limit")
    headers, _ = _headers(client, db, tenant)
    monkeypatch.setattr(settings, "TENANT_RATE_LIMIT_PER_MINUTE", 2)

    first = client.get(f"{settings.API_V1_STR}/tenants/current/health", headers=headers)
    second = client.get(
        f"{settings.API_V1_STR}/tenants/current/health", headers=headers
    )
    third = client.get(f"{settings.API_V1_STR}/tenants/current/health", headers=headers)
    other = _tenant(db, "rate-limit-other")
    other_headers, _ = _headers(client, db, other)
    unaffected = client.get(
        f"{settings.API_V1_STR}/tenants/current/health", headers=other_headers
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert third.status_code == 429, third.text
    assert third.headers["retry-after"]
    assert unaffected.status_code == 200, unaffected.text


def test_platform_admin_deactivates_a_tenant(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    tenant = _tenant(db, "deactivate")
    headers, _ = _headers(client, db, tenant)
    assert (
        client.get(
            f"{settings.API_V1_STR}/tenants/current/health", headers=headers
        ).status_code
        == 200
    )

    admin_headers = dict(superuser_token_headers)
    admin_headers["X-Tenant-ID"] = str(DEFAULT_TENANT_ID)
    deactivated = client.patch(
        f"{settings.API_V1_STR}/tenants/{tenant.id}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert deactivated.status_code == 200, deactivated.text
    assert deactivated.json()["is_active"] is False

    blocked = client.get(
        f"{settings.API_V1_STR}/tenants/current/health", headers=headers
    )
    assert blocked.status_code == 404, blocked.text

    default = client.patch(
        f"{settings.API_V1_STR}/tenants/{DEFAULT_TENANT_ID}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert default.status_code == 400, default.text


def test_tenant_delete_requires_a_matching_slug_and_keeps_default(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    tenant = _tenant(db, "delete-me")
    tenant_id = tenant.id
    headers = dict(superuser_token_headers)
    headers["X-Tenant-ID"] = str(DEFAULT_TENANT_ID)

    wrong = client.request(
        "DELETE",
        f"{settings.API_V1_STR}/tenants/{tenant_id}",
        headers=headers,
        json={"slug": "not-the-slug"},
    )
    assert wrong.status_code == 400, wrong.text

    deleted = client.request(
        "DELETE",
        f"{settings.API_V1_STR}/tenants/{tenant_id}",
        headers=headers,
        json={"slug": tenant.slug},
    )
    assert deleted.status_code == 200, deleted.text
    db.expire_all()
    assert crud.get_tenant(session=db, tenant_id=tenant_id) is None

    default = client.request(
        "DELETE",
        f"{settings.API_V1_STR}/tenants/{DEFAULT_TENANT_ID}",
        headers=headers,
        json={"slug": "default"},
    )
    assert default.status_code == 400, default.text

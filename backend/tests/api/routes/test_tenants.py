import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, col, select

from app import crud
from app.core.config import settings
from app.core.tenancy import DEFAULT_TENANT_ID
from app.models import (
    Filament,
    FilamentBarcode,
    Membership,
    Printer,
    PrintJob,
    Spool,
    Tenant,
    UserCreate,
)
from tests.utils.user import create_random_user, user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


def _tenant_headers(
    tenant_id: uuid.UUID | None, base: dict[str, str]
) -> dict[str, str]:
    headers = dict(base)
    if tenant_id is not None:
        headers["X-Tenant-ID"] = str(tenant_id)
    return headers


def _create_tenant(db: Session, slug: str) -> Tenant:
    tenant = Tenant(name=slug.title(), slug=slug)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


def _create_member(
    db: Session, tenant: Tenant, role: str, email: str | None = None
) -> tuple[str, str]:
    email = email or random_email()
    password = random_lower_string()
    user = crud.create_user(
        session=db,
        user_create=UserCreate(email=email, password=password),
    )
    crud.ensure_membership(session=db, tenant_id=tenant.id, user_id=user.id, role=role)
    return email, password


def test_me_tenants_lists_memberships(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    other = _create_tenant(db, "second")
    email, password = _create_member(db, other, "viewer")
    crud.ensure_membership(
        session=db,
        tenant_id=DEFAULT_TENANT_ID,
        user_id=crud.get_user_by_email(session=db, email=email).id,
        role="operator",
    )

    headers = user_authentication_headers(client=client, email=email, password=password)
    response = client.get(f"{settings.API_V1_STR}/me/tenants", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["count"] == 2
    roles = {item["slug"]: item["role"] for item in data["data"]}
    assert roles == {"default": "operator", "second": "viewer"}


def test_multi_tenant_user_must_choose_a_tenant(
    client: TestClient, db: Session
) -> None:
    other = _create_tenant(db, "second")
    email, password = _create_member(db, other, "viewer")
    user = crud.get_user_by_email(session=db, email=email)
    crud.ensure_membership(
        session=db, tenant_id=DEFAULT_TENANT_ID, user_id=user.id, role="viewer"
    )
    headers = user_authentication_headers(client=client, email=email, password=password)

    response = client.get(f"{settings.API_V1_STR}/spools/", headers=headers)

    assert response.status_code == 400, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "tenant_required"
    assert {item["slug"] for item in detail["tenants"]} == {"default", "second"}

    selected = client.get(
        f"{settings.API_V1_STR}/spools/",
        headers={**headers, "X-Tenant-Slug": "second"},
    )
    assert selected.status_code == 200, selected.text


def test_platform_superuser_can_switch_without_membership(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    other = _create_tenant(db, "second")

    response = client.get(
        f"{settings.API_V1_STR}/spools/",
        headers=_tenant_headers(other.id, superuser_token_headers),
    )

    assert response.status_code == 200, response.text


def test_non_member_gets_404_for_a_known_tenant(
    client: TestClient, db: Session
) -> None:
    other = _create_tenant(db, "second")
    email, password = _create_member(db, other, "viewer")
    user = crud.get_user_by_email(session=db, email=email)
    crud.ensure_membership(
        session=db, tenant_id=DEFAULT_TENANT_ID, user_id=user.id, role="viewer"
    )
    headers = user_authentication_headers(client=client, email=email, password=password)

    response = client.get(
        f"{settings.API_V1_STR}/spools/",
        headers={**headers, "X-Tenant-ID": str(uuid.uuid4())},
    )

    assert response.status_code == 404, response.text


def test_inactive_tenant_is_not_selectable(client: TestClient, db: Session) -> None:
    other = _create_tenant(db, "inactive")
    other.is_active = False
    db.add(other)
    db.commit()
    email, password = _create_member(db, other, "owner")
    headers = user_authentication_headers(client=client, email=email, password=password)

    response = client.get(
        f"{settings.API_V1_STR}/spools/",
        headers={**headers, "X-Tenant-Slug": "inactive"},
    )

    assert response.status_code == 404, response.text


def test_duplicate_serial_across_tenants(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    other = _create_tenant(db, "second")
    serial = f"shared-{uuid.uuid4().hex}"

    default = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=_tenant_headers(DEFAULT_TENANT_ID, superuser_token_headers),
        json={"name": "Default printer", "serial": serial},
    )
    second = client.post(
        f"{settings.API_V1_STR}/printers/",
        headers=_tenant_headers(other.id, superuser_token_headers),
        json={"name": "Second printer", "serial": serial},
    )

    assert default.status_code == 200, default.text
    assert second.status_code == 200, second.text
    assert default.json()["id"] != second.json()["id"]

    default_list = client.get(
        f"{settings.API_V1_STR}/printers/",
        headers=_tenant_headers(DEFAULT_TENANT_ID, superuser_token_headers),
    ).json()
    second_list = client.get(
        f"{settings.API_V1_STR}/printers/",
        headers=_tenant_headers(other.id, superuser_token_headers),
    ).json()
    assert [item["name"] for item in default_list if item["configured"]] == [
        "Default printer"
    ]
    assert [item["name"] for item in second_list if item["configured"]] == [
        "Second printer"
    ]

    cross = client.delete(
        f"{settings.API_V1_STR}/printers/{second.json()['id']}",
        headers=_tenant_headers(DEFAULT_TENANT_ID, superuser_token_headers),
    )
    assert cross.status_code == 404, cross.text


def test_cross_tenant_objects_are_not_reachable(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    other = _create_tenant(db, "second")
    printer = Printer(tenant_id=other.id, name="Other", serial="other-serial")
    filament = Filament(
        tenant_id=other.id,
        brand="Other",
        material="PLA",
        color_name="Black",
        color_hex="#000000",
    )
    db.add(printer)
    db.add(filament)
    db.commit()
    db.refresh(printer)
    db.refresh(filament)
    spool = Spool(
        tenant_id=other.id,
        filament_id=filament.id,
        printer_id=printer.id,
        total_weight_g=1000,
        remaining_g=1000,
        active=True,
    )
    job = PrintJob(
        tenant_id=other.id,
        title="Other job",
        device_id=printer.serial,
        bambu_task_id="other-task",
    )
    db.add(spool)
    db.add(job)
    db.commit()
    db.refresh(spool)
    db.refresh(job)

    headers = _tenant_headers(DEFAULT_TENANT_ID, superuser_token_headers)
    for method, path in (
        ("get", f"/spools/{spool.id}"),
        ("get", f"/filaments/{filament.id}"),
        ("get", f"/prints/{job.id}"),
        ("delete", f"/spools/{spool.id}"),
        ("delete", f"/filaments/{filament.id}"),
        ("delete", f"/prints/{job.id}"),
    ):
        response = getattr(client, method)(
            f"{settings.API_V1_STR}{path}", headers=headers
        )
        assert response.status_code == 404, (method, path, response.text)

    activate = client.put(
        f"{settings.API_V1_STR}/spools/{spool.id}/activate",
        headers=headers,
        json={"printer_id": str(printer.id)},
    )
    assert activate.status_code == 404, activate.text


def test_viewer_and_operator_permissions(client: TestClient, db: Session) -> None:
    viewer_email, viewer_password = _create_member(
        db, db.get(Tenant, DEFAULT_TENANT_ID), "viewer"
    )
    viewer_headers = user_authentication_headers(
        client=client, email=viewer_email, password=viewer_password
    )

    assert (
        client.get(f"{settings.API_V1_STR}/spools/", headers=viewer_headers).status_code
        == 200
    )
    denied = client.post(
        f"{settings.API_V1_STR}/spools/",
        headers=viewer_headers,
        json={"total_weight_g": 1000, "remaining_g": 1000},
    )
    assert denied.status_code == 403, denied.text

    operator_email, operator_password = _create_member(
        db, db.get(Tenant, DEFAULT_TENANT_ID), "operator"
    )
    operator_headers = user_authentication_headers(
        client=client, email=operator_email, password=operator_password
    )
    allowed = client.post(
        f"{settings.API_V1_STR}/spools/",
        headers=operator_headers,
        json={"total_weight_g": 1000, "remaining_g": 1000},
    )
    assert allowed.status_code == 200, allowed.text
    for method, path in (
        ("post", "/bambu/login/start"),
        ("patch", "/tenants/current"),
    ):
        response = getattr(client, method)(
            f"{settings.API_V1_STR}{path}",
            headers=operator_headers,
            json={"email": "a@b.c", "password": "x"}
            if path == "/bambu/login/start"
            else {"name": "Nope"},
        )
        assert response.status_code == 403, (path, response.text)


def test_admin_can_update_the_tenant(client: TestClient, db: Session) -> None:
    admin_email, admin_password = _create_member(
        db, db.get(Tenant, DEFAULT_TENANT_ID), "admin"
    )
    headers = user_authentication_headers(
        client=client, email=admin_email, password=admin_password
    )

    response = client.patch(
        f"{settings.API_V1_STR}/tenants/current",
        headers=headers,
        json={"name": "Renamed tenant"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Renamed tenant"


def test_settings_and_bambu_credentials_are_per_tenant(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    other = _create_tenant(db, "second")
    crud.save_cloud_token(session=db, token="default-token")
    crud.save_cloud_token(session=db, token="second-token", tenant_id=other.id)
    crud.save_cloud_credentials(
        session=db, email="default@example.com", password="secret"
    )
    crud.save_cloud_credentials(
        session=db,
        email="second@example.com",
        password="secret",
        tenant_id=other.id,
    )

    default_settings = client.get(
        f"{settings.API_V1_STR}/settings/",
        headers=_tenant_headers(DEFAULT_TENANT_ID, superuser_token_headers),
    ).json()
    second_settings = client.get(
        f"{settings.API_V1_STR}/settings/",
        headers=_tenant_headers(other.id, superuser_token_headers),
    ).json()
    assert {item["key"]: item["value"] for item in default_settings}[
        "bambu_cloud_email"
    ] == "default@example.com"
    assert {item["key"]: item["value"] for item in second_settings}[
        "bambu_cloud_email"
    ] == "second@example.com"

    cleared = client.delete(
        f"{settings.API_V1_STR}/bambu/session",
        headers=_tenant_headers(other.id, superuser_token_headers),
    )
    assert cleared.status_code == 200, cleared.text
    db.expire_all()
    assert crud.get_cloud_token(session=db) == "default-token"
    assert crud.get_cloud_token(session=db, tenant_id=other.id) is None


def test_same_barcode_maps_to_different_filaments_per_tenant(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    other = _create_tenant(db, "second")
    code = f"barcode-{uuid.uuid4().hex}"
    default_filament = Filament(
        tenant_id=DEFAULT_TENANT_ID,
        brand="Default brand",
        material="PLA",
        color_name="Black",
        color_hex="#000000",
    )
    other_filament = Filament(
        tenant_id=other.id,
        brand="Other brand",
        material="PLA",
        color_name="Black",
        color_hex="#000000",
    )
    db.add(default_filament)
    db.add(other_filament)
    db.commit()
    db.refresh(default_filament)
    db.refresh(other_filament)
    db.add(
        FilamentBarcode(
            tenant_id=DEFAULT_TENANT_ID,
            code=code,
            filament_id=default_filament.id,
        )
    )
    db.add(
        FilamentBarcode(tenant_id=other.id, code=code, filament_id=other_filament.id)
    )
    db.commit()

    default = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=_tenant_headers(DEFAULT_TENANT_ID, superuser_token_headers),
        json={"code": code, "create": False},
    )
    second = client.post(
        f"{settings.API_V1_STR}/spools/scan/barcode",
        headers=_tenant_headers(other.id, superuser_token_headers),
        json={"code": code, "create": False},
    )

    assert default.status_code == 200, default.text
    assert second.status_code == 200, second.text
    assert default.json()["filament"]["brand"] == "Default brand"
    assert second.json()["filament"]["brand"] == "Other brand"


def test_tenant_admin_lists_and_switches_members(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    other = _create_tenant(db, "second")
    email, password = _create_member(db, other, "owner")
    headers = user_authentication_headers(client=client, email=email, password=password)
    assert (
        client.get(f"{settings.API_V1_STR}/me/tenants", headers=headers).json()["count"]
        == 1
    )
    # Only platform admins may create tenants.
    denied = client.post(
        f"{settings.API_V1_STR}/tenants",
        headers=headers,
        json={"name": "Nope", "slug": "nope"},
    )
    assert denied.status_code == 403, denied.text
    created = client.post(
        f"{settings.API_V1_STR}/tenants",
        headers=superuser_token_headers,
        json={"name": "Third", "slug": "third"},
    )
    assert created.status_code == 200, created.text


def test_membership_owner_is_unique_per_tenant(db: Session) -> None:
    tenant = _create_tenant(db, "owners")
    first = create_random_user(db)
    second = create_random_user(db)
    crud.ensure_membership(
        session=db, tenant_id=tenant.id, user_id=first.id, role="owner"
    )
    crud.ensure_membership(
        session=db, tenant_id=tenant.id, user_id=second.id, role="owner"
    )

    owners = db.exec(
        select(Membership).where(
            Membership.tenant_id == tenant.id,
            col(Membership.role) == "owner",
        )
    ).all()
    assert len(owners) == 1
    assert owners[0].user_id == second.id
    # The previous owner keeps admin access instead of losing the tenant.
    assert (
        crud.get_membership(session=db, tenant_id=tenant.id, user_id=first.id).role
        == "admin"
    )

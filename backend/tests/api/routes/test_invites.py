from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Tenant, UserCreate
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


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
        session=db, user_create=UserCreate(email=email, password=password)
    )
    crud.ensure_membership(session=db, tenant_id=tenant.id, user_id=user.id, role=role)
    return email, password


def _invite(
    client: TestClient,
    headers: dict[str, str],
    monkeypatch,
    email: str,
    role: str = "viewer",
) -> dict:
    # Force the "email not delivered" branch so the test can use the link.
    def fail(**_kwargs):
        raise RuntimeError("smtp unavailable")

    monkeypatch.setattr("app.api.routes.tenants.send_email", fail)
    response = client.post(
        f"{settings.API_V1_STR}/tenants/current/invites",
        headers=headers,
        json={"email": email, "role": role},
    )
    assert response.status_code == 200, response.text
    assert response.json()["token"]
    return response.json()


def test_members_and_invites_require_permission(
    client: TestClient, db: Session
) -> None:
    tenant = _create_tenant(db, "members")
    email, password = _create_member(db, tenant, "viewer")
    headers = user_authentication_headers(client=client, email=email, password=password)

    assert (
        client.get(
            f"{settings.API_V1_STR}/tenants/current/members", headers=headers
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"{settings.API_V1_STR}/tenants/current/invites", headers=headers
        ).status_code
        == 403
    )


def test_owner_can_invite_and_accept(
    client: TestClient, db: Session, monkeypatch
) -> None:
    tenant = _create_tenant(db, "invite-accept")
    owner_email, owner_password = _create_member(db, tenant, "owner")
    owner_headers = user_authentication_headers(
        client=client, email=owner_email, password=owner_password
    )
    invited_email, invited_password = _create_member(
        db, _create_tenant(db, "elsewhere"), "viewer"
    )

    created = _invite(
        client, owner_headers, monkeypatch, invited_email, role="operator"
    )
    token = created["token"]

    info = client.get(f"{settings.API_V1_STR}/invites/{token}")
    assert info.status_code == 200, info.text
    assert info.json()["tenant_name"] == tenant.name
    assert info.json()["role"] == "operator"

    invited_headers = user_authentication_headers(
        client=client, email=invited_email, password=invited_password
    )
    accepted = client.post(
        f"{settings.API_V1_STR}/invites/accept",
        headers=invited_headers,
        json={"token": token},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["role"] == "operator"

    reused = client.post(
        f"{settings.API_V1_STR}/invites/accept",
        headers=invited_headers,
        json={"token": token},
    )
    assert reused.status_code == 400, reused.text


def test_accept_requires_the_invited_email(
    client: TestClient, db: Session, monkeypatch
) -> None:
    tenant = _create_tenant(db, "invite-wrong-user")
    owner_email, owner_password = _create_member(db, tenant, "owner")
    owner_headers = user_authentication_headers(
        client=client, email=owner_email, password=owner_password
    )
    created = _invite(client, owner_headers, monkeypatch, random_email())

    other_email, other_password = _create_member(
        db, _create_tenant(db, "wrong-user"), "viewer"
    )
    other_headers = user_authentication_headers(
        client=client, email=other_email, password=other_password
    )
    response = client.post(
        f"{settings.API_V1_STR}/invites/accept",
        headers=other_headers,
        json={"token": created["token"]},
    )
    assert response.status_code == 403, response.text


def test_invite_registers_a_new_account(
    client: TestClient, db: Session, monkeypatch
) -> None:
    tenant = _create_tenant(db, "invite-register")
    owner_email, owner_password = _create_member(db, tenant, "owner")
    owner_headers = user_authentication_headers(
        client=client, email=owner_email, password=owner_password
    )
    invited_email = random_email()
    created = _invite(client, owner_headers, monkeypatch, invited_email)

    response = client.post(
        f"{settings.API_V1_STR}/invites/register",
        json={
            "token": created["token"],
            "password": "a-good-password",
            "full_name": "Invited User",
        },
    )
    assert response.status_code == 200, response.text
    assert crud.get_user_by_email(session=db, email=invited_email) is not None

    headers = user_authentication_headers(
        client=client, email=invited_email, password="a-good-password"
    )
    tenants = client.get(f"{settings.API_V1_STR}/me/tenants", headers=headers).json()[
        "data"
    ]
    assert [item["slug"] for item in tenants] == [tenant.slug]

    duplicate = client.post(
        f"{settings.API_V1_STR}/invites/register",
        json={
            "token": created["token"],
            "password": "a-good-password",
        },
    )
    assert duplicate.status_code == 400, duplicate.text


def test_revoke_invite_blocks_acceptance(
    client: TestClient, db: Session, monkeypatch
) -> None:
    tenant = _create_tenant(db, "invite-revoke")
    owner_email, owner_password = _create_member(db, tenant, "owner")
    owner_headers = user_authentication_headers(
        client=client, email=owner_email, password=owner_password
    )
    created = _invite(client, owner_headers, monkeypatch, random_email())

    revoked = client.delete(
        f"{settings.API_V1_STR}/tenants/current/invites/{created['id']}",
        headers=owner_headers,
    )
    assert revoked.status_code == 200, revoked.text

    info = client.get(f"{settings.API_V1_STR}/invites/{created['token']}")
    assert info.status_code == 400, info.text


def test_owner_transfer_and_last_owner_guard(client: TestClient, db: Session) -> None:
    tenant = _create_tenant(db, "owner-transfer")
    owner_email, owner_password = _create_member(db, tenant, "owner")
    owner_headers = user_authentication_headers(
        client=client, email=owner_email, password=owner_password
    )
    member_email, member_password = _create_member(db, tenant, "admin")
    member = crud.get_user_by_email(session=db, email=member_email)

    promoted = client.patch(
        f"{settings.API_V1_STR}/tenants/current/members/{member.id}",
        headers=owner_headers,
        json={"role": "owner"},
    )
    assert promoted.status_code == 200, promoted.text
    assert promoted.json()["role"] == "owner"

    old_owner = crud.get_user_by_email(session=db, email=owner_email)
    demoted = client.patch(
        f"{settings.API_V1_STR}/tenants/current/members/{old_owner.id}",
        headers=owner_headers,
        json={"role": "admin"},
    )
    assert demoted.status_code == 200, demoted.text
    assert demoted.json()["role"] == "admin"

    # The promoted member is now the only owner, so demoting them must fail.
    new_owner_headers = user_authentication_headers(
        client=client, email=member_email, password=member_password
    )
    denied = client.patch(
        f"{settings.API_V1_STR}/tenants/current/members/{member.id}",
        headers=new_owner_headers,
        json={"role": "admin"},
    )
    assert denied.status_code == 400, denied.text


def test_member_removal_keeps_the_owner(client: TestClient, db: Session) -> None:
    tenant = _create_tenant(db, "member-remove")
    owner_email, owner_password = _create_member(db, tenant, "owner")
    owner_headers = user_authentication_headers(
        client=client, email=owner_email, password=owner_password
    )
    member_email, _ = _create_member(db, tenant, "operator")
    member = crud.get_user_by_email(session=db, email=member_email)

    removed = client.delete(
        f"{settings.API_V1_STR}/tenants/current/members/{member.id}",
        headers=owner_headers,
    )
    assert removed.status_code == 200, removed.text
    assert (
        crud.get_membership(session=db, tenant_id=tenant.id, user_id=member.id) is None
    )

    owner = crud.get_user_by_email(session=db, email=owner_email)
    denied = client.delete(
        f"{settings.API_V1_STR}/tenants/current/members/{owner.id}",
        headers=owner_headers,
    )
    assert denied.status_code == 400, denied.text

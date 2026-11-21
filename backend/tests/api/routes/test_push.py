from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import PushToken, UserCreate
from app.services.notifications import send_push_to_all
from tests.utils.utils import random_email, random_lower_string


def test_register_and_remove_a_push_token(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    payload = {"token": "ExponentPushToken[test-token]", "platform": "android"}
    created = client.post(
        f"{settings.API_V1_STR}/push/register",
        headers=normal_user_token_headers,
        json=payload,
    )
    assert created.status_code == 200, created.text
    assert created.json()["platform"] == "android"

    # Registering the same device again is idempotent.
    repeated = client.post(
        f"{settings.API_V1_STR}/push/register",
        headers=normal_user_token_headers,
        json={"token": payload["token"], "platform": "ios"},
    )
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["id"] == created.json()["id"]

    db.expire_all()
    rows = db.exec(select(PushToken)).all()
    assert len(rows) == 1
    assert rows[0].platform == "ios"

    removed = client.post(
        f"{settings.API_V1_STR}/push/unregister",
        headers=normal_user_token_headers,
        json={"token": payload["token"], "platform": "unknown"},
    )
    assert removed.status_code == 200, removed.text
    db.expire_all()
    assert db.exec(select(PushToken)).all() == []


def test_push_register_requires_a_session(client: TestClient) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/push/register",
        json={"token": "ExponentPushToken[nope]", "platform": "ios"},
    )
    assert response.status_code == 401


def test_send_push_batches_tokens(db: Session, monkeypatch) -> None:
    user = crud.create_user(
        session=db,
        user_create=UserCreate(email=random_email(), password=random_lower_string()),
    )
    db.add(
        PushToken(
            user_id=user.id,
            token="ExponentPushToken[one]",
            platform="ios",
        )
    )
    db.add(
        PushToken(
            user_id=user.id,
            token="ExponentPushToken[two]",
            platform="android",
        )
    )
    db.commit()

    calls = []

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {
                "data": [
                    {"status": "ok"},
                    {
                        "status": "error",
                        "details": {"error": "DeviceNotRegistered"},
                    },
                ]
            }

    def fake_post(url, json, timeout):
        calls.append((url, json, timeout))
        return Response()

    monkeypatch.setattr("app.services.notifications.requests.post", fake_post)

    sent = send_push_to_all(title="Print finished", body="Benchy")
    assert sent == 1
    assert len(calls) == 1
    assert [message["to"] for message in calls[0][1]] == [
        "ExponentPushToken[one]",
        "ExponentPushToken[two]",
    ]
    db.expire_all()
    assert [row.token for row in db.exec(select(PushToken)).all()] == [
        "ExponentPushToken[one]"
    ]

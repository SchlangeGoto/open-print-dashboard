"""Session-opening helpers for code that runs outside a request context.

Services such as the MQTT client and the Bambu cloud client need to read and
write tenant settings without access to a FastAPI request. These helpers open
a short-lived session and delegate to :mod:`app.crud`.
"""

import uuid

from sqlmodel import Session

from app import crud
from app.core.db import engine
from app.core.tenancy import DEFAULT_TENANT_ID


def get_cloud_token(tenant_id: uuid.UUID = DEFAULT_TENANT_ID) -> str | None:
    with Session(engine) as session:
        return crud.get_cloud_token(session=session, tenant_id=tenant_id)


def get_cloud_credentials(
    tenant_id: uuid.UUID = DEFAULT_TENANT_ID,
) -> dict[str, str | None]:
    with Session(engine) as session:
        return crud.get_cloud_credentials(session=session, tenant_id=tenant_id)


def save_cloud_token(token: str, tenant_id: uuid.UUID = DEFAULT_TENANT_ID) -> None:
    with Session(engine) as session:
        crud.save_cloud_token(session=session, token=token, tenant_id=tenant_id)


def save_cloud_credentials(
    email: str,
    password: str,
    tenant_id: uuid.UUID = DEFAULT_TENANT_ID,
) -> None:
    with Session(engine) as session:
        crud.save_cloud_credentials(
            session=session,
            email=email,
            password=password,
            tenant_id=tenant_id,
        )

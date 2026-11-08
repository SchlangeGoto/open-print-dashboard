"""Session-opening helpers for code that runs outside a request context.

Services such as the MQTT client and the Bambu cloud client need to read and
write application settings without access to a FastAPI request. These helpers
open a short-lived session and delegate to :mod:`app.crud`.
"""

from sqlmodel import Session

from app import crud
from app.core.db import engine


def get_cloud_token() -> str | None:
    with Session(engine) as session:
        return crud.get_cloud_token(session=session)


def get_cloud_credentials() -> dict[str, str | None]:
    with Session(engine) as session:
        return crud.get_cloud_credentials(session=session)


def save_cloud_token(token: str) -> None:
    with Session(engine) as session:
        crud.save_cloud_token(session=session, token=token)


def save_cloud_credentials(email: str, password: str) -> None:
    with Session(engine) as session:
        crud.save_cloud_credentials(session=session, email=email, password=password)

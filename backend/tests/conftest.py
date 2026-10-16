from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete

from app import crud
from app.core.config import settings
from app.core.db import engine, init_db
from app.main import app
from app.models import (
    AppSetting,
    Filament,
    PrintJob,
    Spool,
    User,
    UserCreate,
)
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import (
    TEST_SUPERUSER_EMAIL,
    TEST_SUPERUSER_PASSWORD,
    get_superuser_token_headers,
)


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session]:
    with Session(engine) as session:
        init_db(session)
        # Ensure a superuser exists for the test suite, even when the
        # environment does not bootstrap one.
        if not crud.get_user_by_email(session=session, email=TEST_SUPERUSER_EMAIL):
            crud.create_user(
                session=session,
                user_create=UserCreate(
                    email=TEST_SUPERUSER_EMAIL,
                    password=TEST_SUPERUSER_PASSWORD,
                    is_superuser=True,
                ),
            )
        yield session
        session.execute(delete(PrintJob))
        session.execute(delete(Spool))
        session.execute(delete(Filament))
        session.execute(delete(AppSetting))
        session.execute(delete(User))
        session.commit()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture(scope="module")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )

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
    Printer,
    PrintJob,
    RefreshToken,
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

CLEANUP_MODELS = (
    PrintJob,
    Spool,
    Printer,
    Filament,
    AppSetting,
    RefreshToken,
    User,
)


def _clear(session: Session) -> None:
    for model in CLEANUP_MODELS:
        session.execute(delete(model))
    session.commit()


def _ensure_superuser(session: Session) -> None:
    if not crud.get_user_by_email(session=session, email=TEST_SUPERUSER_EMAIL):
        crud.create_user(
            session=session,
            user_create=UserCreate(
                email=TEST_SUPERUSER_EMAIL,
                password=TEST_SUPERUSER_PASSWORD,
                is_superuser=True,
            ),
        )


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session]:
    database = engine.url.database or ""
    if not database.endswith("_test"):
        raise RuntimeError(
            f"Refusing to run tests against {database!r}: set TEST_DATABASE_URL "
            "to a database whose name ends in _test (scripts/test.sh does this)."
        )
    with Session(engine) as session:
        init_db(session)
        _ensure_superuser(session)
        yield session
        _clear(session)


@pytest.fixture(autouse=True)
def clean_db(db: Session) -> Generator[None]:
    """Keep tests independent without ever touching a non-test database."""
    yield
    _clear(db)
    _ensure_superuser(db)


@pytest.fixture(scope="module")
def client() -> Generator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )

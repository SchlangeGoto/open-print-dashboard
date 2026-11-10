import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _settings(**overrides) -> Settings:
    values = {
        "_env_file": None,
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/test",
        "SECRET_KEY": "x" * 32,
    }
    values.update(overrides)
    return Settings(**values)


def test_rejects_placeholder_secret_key_outside_development() -> None:
    with pytest.raises(ValidationError):
        _settings(SECRET_KEY="changethis", FASTAPI_ENV=None)


def test_rejects_short_secret_key_outside_development() -> None:
    with pytest.raises(ValidationError):
        _settings(SECRET_KEY="too-short", FASTAPI_ENV=None)


def test_allows_placeholder_in_development() -> None:
    settings = _settings(SECRET_KEY="changethis", FASTAPI_ENV="development")

    assert settings.SECRET_KEY == "changethis"


def test_accepts_a_long_secret_key() -> None:
    settings = _settings(SECRET_KEY="a" * 64, FASTAPI_ENV=None)

    assert len(settings.SECRET_KEY) == 64


def test_rejects_short_bambu_credentials_key() -> None:
    with pytest.raises(ValidationError):
        _settings(
            SECRET_KEY="a" * 64,
            BAMBU_CREDENTIALS_KEY="too-short",
            FASTAPI_ENV=None,
        )

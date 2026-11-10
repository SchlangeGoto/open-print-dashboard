from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.fixture(autouse=True)
def _clean_secret_env(monkeypatch) -> None:
    for key in (
        "FASTAPI_ENV",
        "SECRET_KEY",
        "SECRET_KEY_FILE",
        "BAMBU_CREDENTIALS_KEY",
    ):
        monkeypatch.delenv(key, raising=False)


def _settings(tmp_path: Path, **overrides) -> Settings:
    values = {
        "_env_file": None,
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/test",
        "SECRET_KEY_FILE": tmp_path / "secret_key",
    }
    values.update(overrides)
    return Settings(**values)


def test_generates_and_persists_a_key_when_missing(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    path = tmp_path / "secret_key"

    assert path.exists()
    assert len(settings.SECRET_KEY) == 64
    assert path.read_text().strip() == settings.SECRET_KEY


def test_replaces_the_placeholder_outside_development(tmp_path: Path) -> None:
    settings = _settings(tmp_path, SECRET_KEY="changethis")

    assert settings.SECRET_KEY != "changethis"
    assert len(settings.SECRET_KEY) == 64


def test_reuses_the_persisted_key(tmp_path: Path) -> None:
    first = _settings(tmp_path)
    second = _settings(tmp_path)

    assert first.SECRET_KEY == second.SECRET_KEY


def test_uses_a_configured_key_without_writing_a_file(tmp_path: Path) -> None:
    settings = _settings(tmp_path, SECRET_KEY="a" * 64)

    assert settings.SECRET_KEY == "a" * 64
    assert not (tmp_path / "secret_key").exists()


def test_allows_the_placeholder_in_development(tmp_path: Path) -> None:
    settings = _settings(
        tmp_path, SECRET_KEY="changethis", FASTAPI_ENV="development"
    )

    assert settings.SECRET_KEY == "changethis"
    assert not (tmp_path / "secret_key").exists()


def test_rejects_short_bambu_credentials_key(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        _settings(
            tmp_path,
            SECRET_KEY="a" * 64,
            BAMBU_CREDENTIALS_KEY="too-short",
        )

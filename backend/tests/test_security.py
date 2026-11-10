from app.core import security
from app.core.config import settings


def test_dedicated_key_decrypts_values_written_with_secret_key(monkeypatch) -> None:
    monkeypatch.setattr(settings, "BAMBU_CREDENTIALS_KEY", None)
    legacy = security.encrypt_secret("old-secret")

    monkeypatch.setattr(settings, "BAMBU_CREDENTIALS_KEY", "dedicated-key")
    assert security.decrypt_secret(legacy) == "old-secret"


def test_wrong_key_is_treated_as_absent(monkeypatch) -> None:
    monkeypatch.setattr(settings, "BAMBU_CREDENTIALS_KEY", "dedicated-key")
    ciphertext = security.encrypt_secret("rotated")

    monkeypatch.setattr(settings, "BAMBU_CREDENTIALS_KEY", None)
    assert security.decrypt_secret(ciphertext) is None


def test_encrypt_uses_dedicated_key_when_configured(monkeypatch) -> None:
    monkeypatch.setattr(settings, "BAMBU_CREDENTIALS_KEY", "dedicated-key")
    ciphertext = security.encrypt_secret("value")

    monkeypatch.setattr(settings, "BAMBU_CREDENTIALS_KEY", None)
    assert security.decrypt_secret(ciphertext) is None
    monkeypatch.setattr(settings, "BAMBU_CREDENTIALS_KEY", "dedicated-key")
    assert security.decrypt_secret(ciphertext) == "value"


def test_plaintext_value_is_treated_as_absent(monkeypatch) -> None:
    monkeypatch.setattr(settings, "BAMBU_CREDENTIALS_KEY", None)
    assert security.decrypt_secret("user@example.com") is None

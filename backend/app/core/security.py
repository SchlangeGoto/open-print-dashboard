import base64
import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from cryptography.fernet import Fernet, InvalidToken
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher

from app.core.config import settings

password_hash = PasswordHash(
    (
        Argon2Hasher(),
        BcryptHasher(),
    )
)

ALGORITHM = "HS256"

logger = logging.getLogger("uvicorn.error")


def create_access_token(subject: str | Any, expires_delta: timedelta) -> str:
    expire = datetime.now(UTC) + expires_delta
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def generate_refresh_token() -> str:
    """Return an opaque, high-entropy refresh token.

    Only the SHA-256 hash is persisted, so a database leak does not expose
    usable refresh tokens.
    """
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_password(
    plain_password: str, hashed_password: str
) -> tuple[bool, str | None]:
    return password_hash.verify_and_update(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return password_hash.hash(password)


def _fernet_from(secret: str) -> Fernet:
    digest = hashlib.sha256(secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _get_fernet() -> Fernet:
    """Return the Fernet instance used for new ciphertext.

    A dedicated ``BAMBU_CREDENTIALS_KEY`` is preferred so Bambu credentials
    survive a ``SECRET_KEY`` rotation. Without one the key is derived from
    ``SECRET_KEY`` for backwards compatibility.
    """
    return _fernet_from(settings.BAMBU_CREDENTIALS_KEY or settings.SECRET_KEY)


def _decrypt_candidates() -> list[Fernet]:
    candidates = [_get_fernet()]
    if settings.BAMBU_CREDENTIALS_KEY:
        # Decrypt values written before the dedicated key was configured.
        candidates.append(_fernet_from(settings.SECRET_KEY))
    return candidates


def is_encrypted(value: str) -> bool:
    """Fernet tokens are base64 and always start with the version byte."""
    return value.startswith("gAAAAA")


def encrypt_secret(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str | None:
    """Decrypt a stored secret, or return ``None`` when it cannot be read.

    A rotated key is treated as "not configured" so callers can fall back to a
    fresh login instead of failing the request.
    """
    for fernet in _decrypt_candidates():
        try:
            return fernet.decrypt(value.encode()).decode()
        except (InvalidToken, ValueError):
            # InvalidToken for a wrong key; ValueError for a value that is not
            # a Fernet token at all (for example a legacy plaintext setting).
            continue
    logger.warning("Could not decrypt a stored secret; treating it as absent")
    return None

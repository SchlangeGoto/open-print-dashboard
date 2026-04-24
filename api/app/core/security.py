import binascii
import hashlib
import secrets

# NIST SP 800-132 recommends ≥ 210 000 iterations of PBKDF2-SHA256 for passwords.
PBKDF2_ITERATIONS = 260_000


def hash_password(password: str, salt: str) -> str:
    """Return a hex-encoded PBKDF2-SHA256 digest of *password* with *salt*.

    Uses 260 000 iterations so the operation is intentionally slow, making
    offline brute-force attacks impractical.
    """
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt.encode(),
        PBKDF2_ITERATIONS,
    )
    return binascii.hexlify(dk).decode()


def generate_salt() -> str:
    """Return a cryptographically-random 16-byte hex salt."""
    return secrets.token_hex(16)

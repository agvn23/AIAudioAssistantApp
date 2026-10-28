from __future__ import annotations

from datetime import timedelta

from pwdlib import PasswordHash

from . import tokens
from .config import settings

_password_hash = PasswordHash.recommended()  # Argon2

# Verified against when the email is unknown, so "no such user" and "wrong password"
# take about the same time.
DUMMY_HASH = _password_hash.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hash.verify(password, password_hash)
    except Exception:  # an unreadable stored hash must fail closed
        return False


def create_access_token(user_id: int, expires_delta: timedelta | None = None) -> str:
    return tokens.create_access_token(
        user_id,
        settings.jwt_secret,
        settings.jwt_algorithm,
        expires_delta or timedelta(minutes=settings.access_token_minutes),
    )


def decode_access_token(token: str) -> int | None:
    return tokens.decode_access_token(token, settings.jwt_secret, settings.jwt_algorithm)

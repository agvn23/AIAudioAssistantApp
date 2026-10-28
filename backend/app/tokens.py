"""JWT helpers with no dependency on app settings, so they are easy to test."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt


def create_access_token(
    user_id: int,
    secret: str,
    algorithm: str = "HS256",
    expires_delta: timedelta = timedelta(minutes=30),
) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + expires_delta}
    return jwt.encode(payload, secret, algorithm=algorithm)


def decode_access_token(token: str, secret: str, algorithm: str = "HS256") -> int | None:
    """Return the user id inside a valid, unexpired token, or None for anything else."""
    try:
        payload = jwt.decode(
            token, secret, algorithms=[algorithm], options={"require": ["exp", "sub"]}
        )
        return int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
        return None

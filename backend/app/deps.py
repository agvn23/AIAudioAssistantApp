from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User
from .security import decode_access_token
from .services.feedback.generators import FeedbackGenerator, build_generator

DbSession = Annotated[Session, Depends(get_db)]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DbSession) -> User:
    unauthorized = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user_id = decode_access_token(token)
    if user_id is None:
        raise unauthorized
    user = db.get(User, user_id)
    if user is None:  # e.g. the account was deleted after the token was issued
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_feedback_generator_factory() -> Callable[[], FeedbackGenerator]:
    """A function that builds the configured generator (raising FeedbackError when the
    provider is not configured). It is a factory so the route can check ownership and status
    first; tests override this dependency with a fake."""
    return lambda: build_generator(settings)


GeneratorFactory = Annotated[
    Callable[[], FeedbackGenerator], Depends(get_feedback_generator_factory)
]
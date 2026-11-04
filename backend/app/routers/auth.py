from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..deps import DbSession
from ..models import User
from ..rate_limit import client_ip, enforce, make_rule
from ..schemas import Token, UserCreate, UserRead
from ..security import DUMMY_HASH, create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _normalize_email(email: str) -> str:
    return email.strip().lower()


@router.post("/register", response_model=UserRead, status_code=201)
def register(payload: UserCreate, request: Request, db: DbSession) -> User:
    # Per client IP, and before the (deliberately slow) password hashing.
    enforce(make_rule("register", client_ip(request), settings.rate_limit_register))

    email = _normalize_email(payload.email)
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two requests registering the same email at once
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered") from None
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()], request: Request, db: DbSession
) -> Token:
    """OAuth2 password form: the `username` field carries the email address."""
    # Every attempt counts, successful or not: this is the brake on password guessing.
    enforce(make_rule("login", client_ip(request), settings.rate_limit_login))

    user = db.scalar(select(User).where(User.email == _normalize_email(form.username)))
    password_ok = verify_password(form.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not password_ok:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user.id))

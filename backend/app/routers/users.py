from __future__ import annotations

from fastapi import APIRouter

from ..deps import CurrentUser
from ..models import User
from ..schemas import UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def read_me(current_user: CurrentUser) -> User:
    return current_user

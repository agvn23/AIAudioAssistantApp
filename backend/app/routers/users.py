from __future__ import annotations

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

from ..config import settings
from ..deps import CurrentUser, DbSession
from ..error_handling import ApiError
from ..models import User
from ..rate_limit import enforce, make_rule
from ..schemas import UserRead
from ..security import verify_password

router = APIRouter(prefix="/users", tags=["users"])


class AccountDelete(BaseModel):
    # max_length bounds the work an Argon2 verification can be asked to do.
    password: str = Field(min_length=1, max_length=128)


@router.get("/me", response_model=UserRead)
def read_me(current_user: CurrentUser) -> User:
    return current_user


@router.delete("/me", status_code=204)
def delete_me(payload: AccountDelete, current_user: CurrentUser, db: DbSession) -> Response:
    """Delete the account and everything it owns.

    The current password is required, so a stolen access token alone cannot wipe an account.
    Tracks, tags, links and analyses are removed by the database (ON DELETE CASCADE, foreign
    keys are enabled in db.py). A background analysis or feedback call that is still running
    for this user ends harmlessly: both write with a plain UPDATE that matches no row.
    """
    # Every try runs an Argon2 verification, and a stolen token could guess passwords here.
    enforce(make_rule("delete-account", current_user.id, settings.rate_limit_delete_account))

    if not verify_password(payload.password, current_user.password_hash):
        raise ApiError(403, "Incorrect password", code="invalid_password")
    db.delete(current_user)
    db.commit()
    return Response(status_code=204)

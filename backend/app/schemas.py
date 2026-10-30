from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from .models import AnalysisStatus, Stage

MAX_TAGS_PER_TRACK = 10
MAX_TAG_LENGTH = 30



def _as_utc(value: datetime) -> datetime:
    """SQLite returns naive datetimes. Everything we store is UTC, so say so explicitly;
    that way a response looks the same right after a write and when read back later."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


UtcDateTime = Annotated[datetime, AfterValidator(_as_utc)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    created_at: UtcDateTime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class _TrackInput(BaseModel):
    """Shared cleaning for create and update payloads."""

    @field_validator("genre", "target_platform", "notes", mode="before", check_fields=False)
    @classmethod
    def _blank_to_none(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("tags", check_fields=False)
    @classmethod
    def _clean_tags(cls, value: list[str] | None) -> list[str] | None:
        """Tags are lower-case, single-spaced and de-duplicated, so "Club" and "club " match."""
        if value is None:
            return None
        cleaned: list[str] = []
        for raw in value:
            name = " ".join(raw.split()).lower()
            if not name:
                raise ValueError("tag names cannot be blank")
            if len(name) > MAX_TAG_LENGTH:
                raise ValueError(f"tag names are limited to {MAX_TAG_LENGTH} characters")
            if name not in cleaned:
                cleaned.append(name)
        if len(cleaned) > MAX_TAGS_PER_TRACK:
            raise ValueError(f"at most {MAX_TAGS_PER_TRACK} tags per track")
        return cleaned


class TrackCreate(_TrackInput):
    title: Title
    genre: str | None = Field(default=None, max_length=100)
    target_platform: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=5000)
    tags: list[str] = Field(default_factory=list)


class TrackUpdate(_TrackInput):
    """PATCH body: only the fields that are sent are changed. `null` clears genre,
    target_platform and notes; title and tags cannot be null."""

    title: Title | None = None
    genre: str | None = Field(default=None, max_length=100)
    target_platform: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=5000)
    tags: list[str] | None = None  # when sent, replaces the whole tag set

    @model_validator(mode="after")
    def _title_and_tags_not_null(self) -> TrackUpdate:
        for name in ("title", "tags"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class TrackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    genre: str | None
    target_platform: str | None
    notes: str | None
    tags: list[str]
    created_at: UtcDateTime
    updated_at: UtcDateTime

    @field_validator("tags", mode="before")
    @classmethod
    def _tag_names(cls, value: Any) -> Any:
        # Accept Tag ORM objects (from the database) or plain strings.
        return sorted(getattr(tag, "name", tag) for tag in value)


class TrackPage(BaseModel):
    items: list[TrackRead]
    total: int
    limit: int
    offset: int


# --- analyses ----------------------------------------------------------------------------------


class AnalysisSummary(BaseModel):
    """What lists return: no metrics or feedback, which can be large."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    track_id: int
    version_number: int
    label: str | None
    stage: Stage | None
    original_filename: str
    status: AnalysisStatus
    error_code: str | None
    created_at: UtcDateTime


class AnalysisRead(AnalysisSummary):
    metrics: dict[str, Any] | None
    feedback: dict[str, Any] | None


class AnalysisUpdate(BaseModel):
    """PATCH body: only label and stage can be edited; `null` clears either one.
    Other fields (status, metrics, ...) in the body are ignored."""

    label: str | None = Field(default=None, max_length=100)
    stage: Stage | None = None

    @field_validator("label", mode="before")
    @classmethod
    def _blank_to_none(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip() or None
        return value

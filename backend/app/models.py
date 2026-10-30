from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# Many-to-many link. Both foreign keys cascade, so deleting a track or a tag
# (or a whole user, via tracks/tags) never leaves dangling rows.
track_tags = Table(
    "track_tags",
    Base.metadata,
    Column("track_id", ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    genre: Mapped[str | None] = mapped_column(String(100))
    target_platform: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    # selectin: tags are loaded in one extra query per list page, not one per track.
    tags: Mapped[list[Tag]] = relationship(
        secondary=track_tags, order_by="Tag.name", lazy="selectin"
    )
    # Analyses deliberately have no ORM relationship here: they are removed by the database
    # (ondelete CASCADE on analyses.track_id, foreign keys are enabled in db.py) and are
    # always queried explicitly, so a track is never loaded together with big metrics JSON.


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_tags_user_id_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(30))


class AnalysisStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class Stage(StrEnum):
    DEMO = "demo"
    MIX = "mix"
    MASTER = "master"


class Analysis(Base):
    """One analysed version of a track. Only the metrics JSON is stored, never the audio."""

    __tablename__ = "analyses"
    __table_args__ = (
        UniqueConstraint("track_id", "version_number", name="uq_analyses_track_id_version_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int]
    label: Mapped[str | None] = mapped_column(String(100))
    stage: Mapped[str | None] = mapped_column(String(16))  # a Stage value
    original_filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default=AnalysisStatus.PENDING.value)
    error_code: Mapped[str | None] = mapped_column(String(50))
    metrics: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    feedback: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

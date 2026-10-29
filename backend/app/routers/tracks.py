from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..deps import CurrentUser, DbSession
from ..models import Tag, Track, User, track_tags, utcnow
from ..schemas import TrackCreate, TrackPage, TrackRead, TrackUpdate

router = APIRouter(prefix="/tracks", tags=["tracks"])


def get_owned_track(db: Session, user: User, track_id: int) -> Track:
    """Ownership rule: a track that belongs to someone else looks exactly like a missing one
    (404, same message), so ids cannot be probed. Every track lookup goes through here."""
    track = db.scalar(select(Track).where(Track.id == track_id, Track.user_id == user.id))
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    return track


def _resolve_tags(db: Session, user: User, names: list[str]) -> list[Tag]:
    """Find the user's tags by name, creating the ones that do not exist yet."""
    if not names:
        return []
    existing = {
        tag.name: tag
        for tag in db.scalars(select(Tag).where(Tag.user_id == user.id, Tag.name.in_(names)))
    }
    tags: list[Tag] = []
    for name in names:
        tag = existing.get(name)
        if tag is None:
            tag = Tag(user_id=user.id, name=name)
            db.add(tag)
            existing[name] = tag
        tags.append(tag)
    return tags


def _delete_unused_tags(db: Session, user: User) -> None:
    """Tags only exist through tracks: drop this user's tags that no track uses any more."""
    db.execute(
        delete(Tag)
        .where(Tag.user_id == user.id, Tag.id.not_in(select(track_tags.c.tag_id)))
        .execution_options(synchronize_session=False)
    )


def _save(db: Session, user: User) -> None:
    try:
        db.flush()
        _delete_unused_tags(db, user)
        db.commit()
    except IntegrityError:  # e.g. two requests creating the same new tag at once
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflicting update, please retry") from None


@router.post("", response_model=TrackRead, status_code=201)
def create_track(payload: TrackCreate, user: CurrentUser, db: DbSession) -> Track:
    track = Track(
        user_id=user.id,  # always the caller; the client cannot choose the owner
        title=payload.title,
        genre=payload.genre,
        target_platform=payload.target_platform,
        notes=payload.notes,
        tags=_resolve_tags(db, user, payload.tags),
    )
    db.add(track)
    _save(db, user)
    return track


@router.get("", response_model=TrackPage)
def list_tracks(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=200, description="Search title and notes")] = None,
    genre: Annotated[str | None, Query(max_length=100)] = None,
    tag: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TrackPage:
    query = select(Track).where(Track.user_id == user.id)

    if q and q.strip():
        term = q.strip()
        query = query.where(
            or_(
                Track.title.icontains(term, autoescape=True),
                Track.notes.icontains(term, autoescape=True),
            )
        )
    if genre and genre.strip():
        query = query.where(func.lower(Track.genre) == genre.strip().lower())
    if tag and tag.strip():
        name = " ".join(tag.split()).lower()
        query = query.where(Track.tags.any(Tag.name == name))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    tracks = db.scalars(
        query.order_by(Track.created_at.desc(), Track.id.desc()).limit(limit).offset(offset)
    ).all()
    return TrackPage(
        items=[TrackRead.model_validate(t) for t in tracks],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{track_id}", response_model=TrackRead)
def read_track(track_id: int, user: CurrentUser, db: DbSession) -> Track:
    return get_owned_track(db, user, track_id)


@router.patch("/{track_id}", response_model=TrackRead)
def update_track(track_id: int, payload: TrackUpdate, user: CurrentUser, db: DbSession) -> Track:
    track = get_owned_track(db, user, track_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return track

    new_tags = changes.pop("tags", None)
    for field, value in changes.items():
        setattr(track, field, value)
    if new_tags is not None:
        track.tags = _resolve_tags(db, user, new_tags)
    track.updated_at = utcnow()  # explicit: a tags-only change issues no UPDATE on tracks
    _save(db, user)
    return track


@router.delete("/{track_id}", status_code=204)
def delete_track(track_id: int, user: CurrentUser, db: DbSession) -> Response:
    track = get_owned_track(db, user, track_id)
    db.delete(track)
    _save(db, user)
    return Response(status_code=204)

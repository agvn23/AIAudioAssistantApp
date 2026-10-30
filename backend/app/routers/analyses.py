from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import ALLOWED_AUDIO_EXTENSIONS, settings
from ..deps import CurrentUser, DbSession
from ..models import Analysis, Stage, Track, User
from ..schemas import AnalysisRead, AnalysisSummary, AnalysisUpdate
from ..services.analysis_runner import remove_quietly, run_analysis
from .tracks import get_owned_track

router = APIRouter(tags=["analyses"])

CHUNK_BYTES = 1024 * 1024


def get_owned_analysis(db: Session, user: User, analysis_id: int) -> Analysis:
    """Same rule as tracks: someone else's analysis looks exactly like a missing one (404).
    Ownership is checked through the parent track."""
    analysis = db.scalar(
        select(Analysis)
        .join(Track, Track.id == Analysis.track_id)
        .where(Analysis.id == analysis_id, Track.user_id == user.id)
    )
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis


def _clean_filename(raw: str | None) -> str:
    """The client's file name is only a label: strip any directory part (either separator)
    and non-printable characters. It is never used to build a path."""
    name = (raw or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(ch for ch in name if ch.isprintable()).strip()
    return name[:255] or "upload"


def _save_upload(upload: UploadFile, suffix: str) -> str:
    """Copy the upload to a randomly named temp file, enforcing the size limit while copying.
    Returns the path. On any failure the partial file is removed.

    Note: Starlette has already received and spooled the request body by the time we get
    here, so this limit protects disk and ffmpeg, not bandwidth. Put a body-size limit on
    the reverse proxy when deploying."""
    limit = settings.max_upload_mb * 1024 * 1024
    too_large = HTTPException(
        status_code=413, detail=f"File is larger than {settings.max_upload_mb} MB"
    )
    if upload.size is not None and upload.size > limit:
        raise too_large

    fd, temp_path = tempfile.mkstemp(prefix="upload_", suffix=suffix, dir=settings.upload_tmp_dir)
    try:
        written = 0
        with os.fdopen(fd, "wb") as out:
            while chunk := upload.file.read(CHUNK_BYTES):
                written += len(chunk)
                if written > limit:
                    raise too_large
                out.write(chunk)
        if written == 0:
            raise HTTPException(status_code=422, detail="Uploaded file is empty")
    except BaseException:
        remove_quietly(temp_path)
        raise
    return temp_path


def _create_analysis(
    db: Session, track_id: int, filename: str, stage: Stage | None, label: str | None
) -> Analysis:
    """Insert the next version. Two uploads racing for the same number hit the unique
    constraint; the loser retries once with a fresh number."""
    for _attempt in range(2):
        last = db.scalar(
            select(func.coalesce(func.max(Analysis.version_number), 0)).where(
                Analysis.track_id == track_id
            )
        )
        analysis = Analysis(
            track_id=track_id,
            version_number=(last or 0) + 1,
            label=label,
            stage=stage.value if stage else None,
            original_filename=filename,
        )
        db.add(analysis)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue
        return analysis
    raise HTTPException(status_code=409, detail="Conflicting update, please retry")


@router.post(
    "/tracks/{track_id}/analyses", response_model=AnalysisRead, status_code=202
)
def upload_analysis(
    track_id: int,
    user: CurrentUser,
    db: DbSession,
    background: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    stage: Annotated[Stage | None, Form()] = None,
    label: Annotated[str | None, Form(max_length=100)] = None,
) -> Analysis:
    track = get_owned_track(db, user, track_id)  # 404 before we touch the upload

    filename = _clean_filename(file.filename)
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported audio file type")

    # What the engine gets to know about the track (it passes this through untouched).
    context = {
        key: value
        for key, value in {
            "genre": track.genre,
            "target_platform": track.target_platform,
            "stage": stage.value if stage else None,
        }.items()
        if value
    }

    temp_path = _save_upload(file, suffix)
    try:
        analysis = _create_analysis(db, track.id, filename, stage, (label or "").strip() or None)
    except BaseException:
        remove_quietly(temp_path)
        raise

    # From here on the task owns the temp file and deletes it in a finally block.
    background.add_task(run_analysis, analysis.id, temp_path, context, filename)
    return analysis


@router.get("/tracks/{track_id}/analyses", response_model=list[AnalysisSummary])
def list_analyses(track_id: int, user: CurrentUser, db: DbSession) -> list[Analysis]:
    track = get_owned_track(db, user, track_id)
    return list(
        db.scalars(
            select(Analysis)
            .where(Analysis.track_id == track.id)
            .order_by(Analysis.version_number)
        )
    )


@router.get("/analyses/{analysis_id}", response_model=AnalysisRead)
def read_analysis(analysis_id: int, user: CurrentUser, db: DbSession) -> Analysis:
    return get_owned_analysis(db, user, analysis_id)


@router.patch("/analyses/{analysis_id}", response_model=AnalysisRead)
def update_analysis(
    analysis_id: int, payload: AnalysisUpdate, user: CurrentUser, db: DbSession
) -> Analysis:
    analysis = get_owned_analysis(db, user, analysis_id)
    changes = payload.model_dump(exclude_unset=True)
    if "stage" in changes and changes["stage"] is not None:
        changes["stage"] = changes["stage"].value
    for field, value in changes.items():
        setattr(analysis, field, value)
    if changes:
        db.commit()
    return analysis


@router.delete("/analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: int, user: CurrentUser, db: DbSession) -> Response:
    analysis = get_owned_analysis(db, user, analysis_id)
    db.delete(analysis)
    db.commit()
    return Response(status_code=204)

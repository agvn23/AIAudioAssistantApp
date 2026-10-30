from __future__ import annotations

import logging
import os
from typing import Any

from sqlalchemy import update

from analysis.errors import AnalysisError  # adjust if AnalysisError lives elsewhere
from analysis.metrics import analyze_file

from ..db import SessionLocal
from ..models import Analysis, AnalysisStatus

logger = logging.getLogger(__name__)


def remove_quietly(path: str) -> None:
    """Delete a temp file; a missing file is fine."""
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError:
        logger.warning("could not delete temp file %s", path)


def _update(analysis_id: int, **values: Any) -> bool:
    """Write to one analysis row in its own short session. Returns False when the row no
    longer exists (e.g. the user deleted the version or track while it was running).
    A plain UPDATE is used on purpose: it never fails on a row that has disappeared."""
    with SessionLocal() as db:
        result = db.execute(update(Analysis).where(Analysis.id == analysis_id).values(**values))
        db.commit()
        return result.rowcount > 0


def run_analysis(
    analysis_id: int,
    temp_path: str,
    context: dict[str, str] | None,
    original_filename: str,
) -> None:
    """Background task: pending -> running -> done | failed. Always deletes the temp file.

    It opens its own sessions: the request's session is closed once the response is sent.
    """
    try:
        if not _update(analysis_id, status=AnalysisStatus.RUNNING.value):
            return  # deleted before it started

        try:
            metrics = analyze_file(temp_path, context=context or None)
        except AnalysisError as exc:
            _update(analysis_id, status=AnalysisStatus.FAILED.value, error_code=exc.code)
            return
        except Exception:
            # Log server-side (never the audio); the API only ever shows a generic code.
            logger.exception("analysis %s failed unexpectedly", analysis_id)
            _update(
                analysis_id, status=AnalysisStatus.FAILED.value, error_code="internal_error"
            )
            return

        # The engine saw a random temp name; show the user's own file name instead.
        metrics.setdefault("file", {})["name"] = original_filename
        _update(
            analysis_id, status=AnalysisStatus.DONE.value, metrics=metrics, error_code=None
        )
    finally:
        remove_quietly(temp_path)


def mark_interrupted() -> int:
    """Called at startup. Background tasks die with the process, so anything still pending or
    running belongs to a previous run and would otherwise stay stuck forever.
    (Assumes a single server process; revisit when moving to a queue or several workers.)"""
    with SessionLocal() as db:
        result = db.execute(
            update(Analysis)
            .where(Analysis.status.in_([AnalysisStatus.PENDING.value, AnalysisStatus.RUNNING.value]))
            .values(status=AnalysisStatus.FAILED.value, error_code="interrupted")
        )
        db.commit()
        return result.rowcount

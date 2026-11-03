"""Pydantic models for AI feedback.

`Feedback` is what the LLM must produce (its JSON schema is handed to the model).
`StoredFeedback` adds server-side metadata and is what ends up in `analyses.feedback`;
the model never writes the metadata itself.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ...models import Stage

MAX_ITEMS = 8
MAX_CAVEATS = 5
MAX_EVIDENCE_PER_ITEM = 4

FEEDBACK_SCHEMA_VERSION = 1

Area = Literal["loudness", "dynamics", "tempo", "key", "spectrum", "stereo", "overall"]
Priority = Literal["high", "medium", "low"]

Summary = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=800)]
ItemText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]
Caveat = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
MetricPath = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class _Strict(BaseModel):
    # extra="forbid" also puts additionalProperties: false into the JSON schema.
    model_config = ConfigDict(extra="forbid")


class EvidenceRef(_Strict):
    """A measurement the item is based on, as a path into the metrics JSON plus its value,
    e.g. {"metric": "loudness.true_peak_dbtp", "value": 1.2}. The service later checks that
    the path exists and the value matches what was measured."""

    metric: MetricPath
    value: float


class FeedbackItem(_Strict):
    area: Area
    priority: Priority
    observation: ItemText  # what the numbers show
    suggestion: ItemText  # what to do about it
    evidence: list[EvidenceRef] = Field(min_length=1, max_length=MAX_EVIDENCE_PER_ITEM)


class Feedback(_Strict):
    summary: Summary
    items: list[FeedbackItem] = Field(min_length=1, max_length=MAX_ITEMS)
    caveats: list[Caveat] = Field(default_factory=list, max_length=MAX_CAVEATS)


class FeedbackContext(BaseModel):
    """The context the feedback was generated for. Stored so the UI can tell when the
    feedback is stale (for example the stage was edited afterwards)."""

    genre: str | None = None
    target_platform: str | None = None
    stage: Stage | None = None


class FeedbackMeta(BaseModel):
    model: str
    generated_at: datetime
    context_used: FeedbackContext
    feedback_schema_version: int = FEEDBACK_SCHEMA_VERSION


class StoredFeedback(Feedback):
    meta: FeedbackMeta
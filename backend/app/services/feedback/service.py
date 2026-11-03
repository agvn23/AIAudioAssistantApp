"""Generate feedback for one analysis: build the input, call the model, validate the answer,
verify the evidence, retry once if needed. Pure apart from the generator call."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from pydantic import ValidationError

from ...models import Stage
from .checks import clamp_for_stage, clamp_unreliable, verify_evidence
from .errors import FeedbackError
from .generators import FeedbackGenerator
from .prompt import SYSTEM_PROMPT, build_llm_input, build_user_message, evidence_space
from .schemas import Feedback, FeedbackContext, FeedbackMeta, StoredFeedback

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 2  # the first try plus one retry with the problems spelled out
MAX_PROBLEMS_REPORTED = 5

_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)


def _strip_code_fences(text: str) -> str:
    match = _FENCE.match(text)
    return match.group(1) if match else text


def _describe_validation_error(exc: ValidationError) -> list[str]:
    problems = []
    for error in exc.errors()[:MAX_PROBLEMS_REPORTED]:
        where = ".".join(str(part) for part in error["loc"]) or "response"
        problems.append(f"{where}: {error['msg']}")
    return problems


def _check(raw: str, citable: dict[str, Any]) -> tuple[Feedback | None, list[str]]:
    """Parse and verify one answer. Returns (feedback, problems); feedback is only usable
    when problems is empty."""
    try:
        feedback = Feedback.model_validate_json(_strip_code_fences(raw))
    except ValidationError as exc:
        return None, _describe_validation_error(exc)
    return feedback, verify_evidence(feedback, citable)[:MAX_PROBLEMS_REPORTED]


def _retry_message(user_message: str, problems: list[str]) -> str:
    listed = "\n".join(f"- {problem}" for problem in problems)
    return (
        f"{user_message}\n\n"
        f"Your previous answer was rejected for these reasons:\n{listed}\n"
        "Return a corrected answer that follows all the rules. Cite metrics only by the exact "
        "paths that appear in the analysis, with their exact values."
    )


def generate_feedback(
    generator: FeedbackGenerator,
    metrics: dict[str, Any],
    *,
    genre: str | None,
    target_platform: str | None,
    stage: Stage | str | None,
) -> dict[str, Any]:
    """Returns the dict to store in analyses.feedback (a StoredFeedback as plain JSON).
    Raises FeedbackError: provider errors pass through unchanged, and an answer that is still
    invalid after the retry becomes 'invalid_output'."""
    llm_input = build_llm_input(
        metrics, genre=genre, target_platform=target_platform, stage=stage
    )
    measurements = llm_input["measurements"]
    citable = evidence_space(llm_input)
    first_message = build_user_message(llm_input)
    json_schema = Feedback.model_json_schema()

    message = first_message
    feedback: Feedback | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        raw = generator.generate(
            system_prompt=SYSTEM_PROMPT, user_message=message, json_schema=json_schema
        )
        feedback, problems = _check(raw, citable)
        if feedback is not None and not problems:
            break
        logger.warning("feedback attempt %d rejected (%d problems)", attempt, len(problems))
        message = _retry_message(first_message, problems)
    else:
        raise FeedbackError(
            "invalid_output", "The AI provider did not return usable feedback. Try again."
        )

    assert feedback is not None
    feedback = clamp_unreliable(feedback, measurements)
    feedback = clamp_for_stage(feedback, llm_input["context"], measurements)
    stored = StoredFeedback(
        **feedback.model_dump(),
        meta=FeedbackMeta(
            model=generator.model_name,
            generated_at=datetime.now(timezone.utc),
            context_used=FeedbackContext(**llm_input["context"]),
        ),
    )
    return stored.model_dump(mode="json")
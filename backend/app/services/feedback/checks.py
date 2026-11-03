"""Deterministic checks on what the model returned. Pure functions."""

from __future__ import annotations

import math
from typing import Any

from .schemas import Feedback

# The model rounds numbers, so allow a little slack: 1 % relative or 0.05 absolute.
VALUE_REL_TOL = 0.01
VALUE_ABS_TOL = 0.05

# Areas whose reliability flag can force an item down to "low".
_SUGGESTION_AREAS = ("tempo", "key")

# At these stages the final limiter is still to come, so loudness is not urgent.
SOFT_LOUDNESS_STAGES = frozenset({"demo", "mix"})


def resolve_metric(measurements: dict[str, Any], path: str) -> float | None:
    """Follow a dotted path into `measurements`. Returns the number, or None when the path
    does not exist or does not end on a number (booleans do not count)."""
    path = path.strip()
    if path.startswith("measurements."):
        path = path[len("measurements.") :]
    node: Any = measurements
    for part in path.split("."):
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            return None
    if isinstance(node, bool) or not isinstance(node, (int, float)):
        return None
    return float(node)


def verify_evidence(feedback: Feedback, measurements: dict[str, Any]) -> list[str]:
    """Problems found in the evidence of every item; an empty list means all of it checks out.
    The messages are short enough to be fed back to the model on a retry."""
    problems: list[str] = []
    for index, item in enumerate(feedback.items):
        for ref in item.evidence:
            actual = resolve_metric(measurements, ref.metric)
            if actual is None:
                problems.append(f"items[{index}]: '{ref.metric}' is not a numeric measurement")
            elif not math.isclose(ref.value, actual, rel_tol=VALUE_REL_TOL, abs_tol=VALUE_ABS_TOL):
                problems.append(
                    f"items[{index}]: {ref.metric} is {actual}, but the item says {ref.value}"
                )
    return problems


def clamp_unreliable(feedback: Feedback, measurements: dict[str, Any]) -> Feedback:
    """Tempo or key items built on an unreliable (or missing) measurement are at most "low"."""
    unreliable = set()
    for area in _SUGGESTION_AREAS:
        section = measurements.get(area)
        if section is None or section.get("reliable") is False:
            unreliable.add(area)

    items = [
        item.model_copy(update={"priority": "low"})
        if item.area in unreliable and item.priority != "low"
        else item
        for item in feedback.items
    ]
    return feedback.model_copy(update={"items": items})


def clamp_for_stage(
    feedback: Feedback, context: dict[str, Any], measurements: dict[str, Any]
) -> Feedback:
    """At the demo and mix stages loudness items are at most "medium", unless samples are
    actually clipped (a real problem at any stage)."""
    if context.get("stage") not in SOFT_LOUDNESS_STAGES:
        return feedback
    clipped = (measurements.get("loudness") or {}).get("clipped_samples")
    if isinstance(clipped, (int, float)) and not isinstance(clipped, bool) and clipped > 0:
        return feedback

    items = [
        item.model_copy(update={"priority": "medium"})
        if item.area == "loudness" and item.priority == "high"
        else item
        for item in feedback.items
    ]
    return feedback.model_copy(update={"items": items})
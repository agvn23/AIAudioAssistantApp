"""Test doubles and sample data shared by the feedback tests."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

_EXAMPLE = json.loads((Path(__file__).parent / "data" / "example_metrics.json").read_text())


def example_metrics() -> dict:
    return deepcopy(_EXAMPLE)


class FakeGenerator:
    """Returns scripted outputs in order; an Exception in the script is raised instead."""

    model_name = "fake-model"

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = []

    def generate(self, *, system_prompt, user_message, json_schema):
        self.calls.append(
            {"system_prompt": system_prompt, "user_message": user_message, "json_schema": json_schema}
        )
        result = self.outputs.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


def good_item(**overrides) -> dict:
    data = {
        "area": "loudness",
        "priority": "high",
        "observation": "True peak is above 0 dBTP.",
        "suggestion": "Lower the limiter ceiling.",
        "evidence": [{"metric": "loudness.true_peak_dbtp", "value": 1.2}],
    }
    data.update(overrides)
    return data


def good_output(items=None, summary="Loud, bass-heavy demo.") -> str:
    return json.dumps({"summary": summary, "items": items or [good_item()], "caveats": []})
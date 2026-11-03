import json
import re
from copy import deepcopy
from pathlib import Path

import pytest

from app.services.feedback.checks import (
    clamp_for_stage,
    clamp_unreliable,
    resolve_metric,
    verify_evidence,
)
from app.services.feedback.prompt import SYSTEM_PROMPT, build_llm_input, evidence_space
from app.services.feedback.schemas import Feedback

EXAMPLE = json.loads((Path(__file__).parent / "data" / "example_metrics.json").read_text())


def example_input():
    return build_llm_input(
        deepcopy(EXAMPLE), genre="pop rock", target_platform="spotify", stage="demo"
    )


@pytest.fixture()
def measurements():
    return example_input()["measurements"]


def item(**overrides):
    data = {
        "area": "loudness",
        "priority": "high",
        "observation": "True peak is above 0 dBTP.",
        "suggestion": "Lower the limiter ceiling.",
        "evidence": [{"metric": "loudness.true_peak_dbtp", "value": 1.2}],
    }
    data.update(overrides)
    return data


def feedback(items=None):
    return Feedback.model_validate(
        {"summary": "Loud demo.", "items": items or [item()], "caveats": []}
    )


# --- resolve_metric ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("loudness.true_peak_dbtp", 1.2),
        ("spectrum.bands.sub.relative_db", 11.13),
        ("tempo.bpm", 128.0),
        ("file.channels", 2.0),
        ("measurements.loudness.integrated_lufs", -10.4),  # a stray prefix is tolerated
        (" loudness.integrated_lufs ", -10.4),
    ],
)
def test_resolve_metric_finds_numbers(measurements, path, expected):
    assert resolve_metric(measurements, path) == expected


@pytest.mark.parametrize(
    "path",
    [
        "",
        "loudness",  # a section, not a number
        "loudness.nope",
        "stereo.mono_compatible",  # booleans are not measurements
        "tempo.reliable",
        "spectrum.bands.sub",
        "spectrum.bands.sub.relative_db.extra",
        "context.genre",
    ],
)
def test_resolve_metric_rejects_everything_else(measurements, path):
    assert resolve_metric(measurements, path) is None


def test_every_path_example_in_the_system_prompt_resolves():
    space = evidence_space(example_input())
    pattern = r"`((?:file|loudness|dynamics|spectrum|stereo|tempo|key|reference)\.[a-z_.]+)`"
    paths = re.findall(pattern, SYSTEM_PROMPT)
    assert paths, "expected the prompt to contain example metric paths"
    assert any(path.startswith("reference.") for path in paths)
    for path in paths:
        assert resolve_metric(space, path) is not None, path


# --- verify_evidence -----------------------------------------------------------------------


def test_correct_evidence_passes(measurements):
    assert verify_evidence(feedback(), measurements) == []


def test_small_rounding_is_accepted(measurements):
    ev = [{"metric": "loudness.integrated_lufs", "value": -10.41}]
    assert verify_evidence(feedback([item(evidence=ev)]), measurements) == []


def test_wrong_value_is_reported(measurements):
    ev = [{"metric": "loudness.true_peak_dbtp", "value": 0.4}]
    problems = verify_evidence(feedback([item(evidence=ev)]), measurements)
    assert len(problems) == 1
    assert "loudness.true_peak_dbtp" in problems[0] and "items[0]" in problems[0]


def test_unknown_metric_is_reported(measurements):
    ev = [{"metric": "loudness.warmth", "value": 3.0}]
    problems = verify_evidence(feedback([item(evidence=ev)]), measurements)
    assert len(problems) == 1 and "loudness.warmth" in problems[0]


def test_problems_are_collected_across_items(measurements):
    bad = [{"metric": "stereo.width", "value": 0.9}]
    items = [item(), item(area="stereo", evidence=bad), item(area="stereo", evidence=bad)]
    problems = verify_evidence(feedback(items), measurements)
    assert len(problems) == 2
    assert problems[0].startswith("items[1]") and problems[1].startswith("items[2]")


# --- clamp_unreliable ----------------------------------------------------------------------


def test_unreliable_tempo_items_are_clamped_to_low(measurements):
    measurements["tempo"]["reliable"] = False
    original = feedback(
        [
            item(area="tempo", priority="high"),
            item(area="loudness", priority="high"),
            item(area="key", priority="medium"),
        ]
    )
    result = clamp_unreliable(original, measurements)
    assert [i.priority for i in result.items] == ["low", "high", "medium"]
    assert original.items[0].priority == "high"  # the input is not modified


def test_unreliable_key_items_are_clamped_to_low(measurements):
    measurements["key"]["reliable"] = False
    result = clamp_unreliable(feedback([item(area="key", priority="high")]), measurements)
    assert result.items[0].priority == "low"


def test_reliable_measurements_are_left_alone(measurements):
    original = feedback([item(area="tempo", priority="high"), item(area="key", priority="medium")])
    result = clamp_unreliable(original, measurements)
    assert [i.priority for i in result.items] == ["high", "medium"]


def test_missing_tempo_section_counts_as_unreliable(measurements):
    del measurements["tempo"]
    result = clamp_unreliable(feedback([item(area="tempo", priority="high")]), measurements)
    assert result.items[0].priority == "low"


# --- clamp_for_stage -----------------------------------------------------------------------


@pytest.mark.parametrize("stage", ["demo", "mix"])
def test_loudness_items_are_capped_at_medium_before_mastering(measurements, stage):
    original = feedback([item(priority="high")])
    result = clamp_for_stage(original, {"stage": stage}, measurements)
    assert result.items[0].priority == "medium"
    assert original.items[0].priority == "high"  # the input is not modified


@pytest.mark.parametrize("context", [{"stage": "master"}, {}])
def test_no_cap_at_master_or_without_a_stage(measurements, context):
    result = clamp_for_stage(feedback([item(priority="high")]), context, measurements)
    assert result.items[0].priority == "high"


def test_no_cap_when_samples_are_clipped(measurements):
    measurements["loudness"]["clipped_samples"] = 12
    result = clamp_for_stage(feedback([item(priority="high")]), {"stage": "demo"}, measurements)
    assert result.items[0].priority == "high"


def test_only_high_loudness_items_are_changed(measurements):
    original = feedback(
        [
            item(area="stereo", priority="high"),
            item(area="loudness", priority="low"),
            item(area="loudness", priority="medium"),
            item(area="loudness", priority="high"),
        ]
    )
    result = clamp_for_stage(original, {"stage": "mix"}, measurements)
    assert [i.priority for i in result.items] == ["high", "low", "medium", "medium"]
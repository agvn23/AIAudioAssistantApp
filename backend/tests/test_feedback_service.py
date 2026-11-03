import json
from copy import deepcopy
from pathlib import Path

import pytest

from app.models import Stage
from app.services.feedback.errors import FeedbackError
from app.services.feedback.prompt import SYSTEM_PROMPT
from app.services.feedback.schemas import Feedback, StoredFeedback
from app.services.feedback.service import MAX_ATTEMPTS, generate_feedback

EXAMPLE = json.loads((Path(__file__).parent / "data" / "example_metrics.json").read_text())


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


def output(items=None):
    return json.dumps(
        {"summary": "Loud, bass-heavy demo.", "items": items or [item()], "caveats": ["Truncated."]}
    )


def run(generator, metrics=None, **overrides):
    args = {"genre": "pop rock", "target_platform": "spotify", "stage": Stage.DEMO}
    args.update(overrides)
    return generate_feedback(generator, deepcopy(EXAMPLE) if metrics is None else metrics, **args)


# --- success -------------------------------------------------------------------------------


def test_valid_answer_is_returned_as_storable_json():
    result = run(FakeGenerator(output()))

    json.dumps(result)  # plain JSON for the column
    stored = StoredFeedback.model_validate(result)
    assert stored.items[0].evidence[0].metric == "loudness.true_peak_dbtp"
    assert result["meta"]["model"] == "fake-model"
    assert result["meta"]["context_used"] == {
        "genre": "pop rock",
        "target_platform": "spotify",
        "stage": "demo",
    }
    assert isinstance(result["meta"]["generated_at"], str)


def test_the_model_gets_the_prompts_and_schema_but_not_the_file_name():
    generator = FakeGenerator(output())
    run(generator, stage=Stage.MASTER)

    sent = generator.calls[0]
    assert sent["system_prompt"] == SYSTEM_PROMPT
    assert sent["json_schema"] == Feedback.model_json_schema()
    assert "<analysis>" in sent["user_message"]
    assert "my_secret_demo" not in sent["user_message"]
    assert '"stage": "master"' in sent["user_message"]  # from the argument, not metrics.context


def test_code_fences_around_the_json_are_tolerated():
    result = run(FakeGenerator("```json\n" + output() + "\n```"))
    assert result["items"][0]["area"] == "loudness"


def test_stored_metrics_are_not_modified():
    metrics = deepcopy(EXAMPLE)
    run(FakeGenerator(output()), metrics=metrics)
    assert metrics == EXAMPLE


def test_items_on_an_unreliable_tempo_are_clamped_to_low():
    metrics = deepcopy(EXAMPLE)
    metrics["tempo"]["confidence"] = 0.1
    tempo_item = item(
        area="tempo",
        priority="high",
        evidence=[{"metric": "tempo.confidence", "value": 0.1}],
    )
    result = run(FakeGenerator(output([tempo_item])), metrics=metrics)
    assert result["items"][0]["priority"] == "low"


# --- retries -------------------------------------------------------------------------------


def test_invalid_json_is_retried_once_with_the_problem_spelled_out():
    generator = FakeGenerator("this is not json", output())
    result = run(generator)

    assert len(generator.calls) == 2
    retry = generator.calls[1]["user_message"]
    assert retry.startswith(generator.calls[0]["user_message"])
    assert "rejected" in retry
    assert result["items"]


def test_wrong_evidence_is_retried():
    wrong = item(evidence=[{"metric": "loudness.true_peak_dbtp", "value": -3.0}])
    generator = FakeGenerator(output([wrong]), output())
    result = run(generator)

    assert len(generator.calls) == 2
    assert "loudness.true_peak_dbtp" in generator.calls[1]["user_message"]
    assert result["items"][0]["evidence"][0]["value"] == 1.2


def test_gives_up_with_invalid_output_after_the_retry():
    generator = FakeGenerator("nope", "still nope")
    with pytest.raises(FeedbackError) as info:
        run(generator)
    assert info.value.code == "invalid_output"
    assert len(generator.calls) == MAX_ATTEMPTS


def test_empty_answers_count_as_invalid():
    with pytest.raises(FeedbackError) as info:
        run(FakeGenerator("", ""))
    assert info.value.code == "invalid_output"


# --- provider errors -----------------------------------------------------------------------


def test_provider_errors_pass_through_without_a_retry():
    generator = FakeGenerator(FeedbackError("timeout", "slow"))
    with pytest.raises(FeedbackError) as info:
        run(generator)
    assert info.value.code == "timeout"
    assert len(generator.calls) == 1

# --- stage rule and platform reference -----------------------------------------------------


def test_loudness_items_are_capped_at_medium_before_mastering():
    result = run(FakeGenerator(output()))  # stage demo, the item is a high loudness item
    assert result["items"][0]["priority"] == "medium"


def test_loudness_items_keep_high_priority_at_master_stage():
    result = run(FakeGenerator(output()), stage=Stage.MASTER)
    assert result["items"][0]["priority"] == "high"


def test_reference_values_are_accepted_as_evidence():
    ref_item = item(
        priority="medium",
        evidence=[{"metric": "reference.integrated_lufs_difference", "value": 3.6}],
    )
    result = run(FakeGenerator(output([ref_item])))
    assert result["items"][0]["evidence"][0]["metric"] == "reference.integrated_lufs_difference"


def test_a_wrong_reference_value_is_rejected():
    wrong = item(evidence=[{"metric": "reference.integrated_lufs_difference", "value": 9.9}])
    with pytest.raises(FeedbackError) as info:
        run(FakeGenerator(output([wrong]), output([wrong])))
    assert info.value.code == "invalid_output"


def test_the_model_receives_the_reference_section():
    generator = FakeGenerator(output())
    run(generator)
    assert '"reference"' in generator.calls[0]["user_message"]
    assert '"integrated_lufs_difference": 3.6' in generator.calls[0]["user_message"]
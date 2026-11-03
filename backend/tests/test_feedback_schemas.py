import json
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.models import Stage
from app.services.feedback.schemas import (
    MAX_CAVEATS,
    MAX_EVIDENCE_PER_ITEM,
    MAX_ITEMS,
    Feedback,
    FeedbackContext,
    FeedbackMeta,
    StoredFeedback,
)


def item(**overrides):
    data = {
        "area": "loudness",
        "priority": "high",
        "observation": "True peak is above 0 dBTP.",
        "suggestion": "Lower the limiter ceiling to about -1 dBTP.",
        "evidence": [{"metric": "loudness.true_peak_dbtp", "value": 1.2}],
    }
    data.update(overrides)
    return data


def feedback(**overrides):
    data = {"summary": "Loud and bass-heavy demo.", "items": [item()], "caveats": []}
    data.update(overrides)
    return data


# --- Feedback ------------------------------------------------------------------------------


def test_valid_feedback_parses():
    parsed = Feedback.model_validate(feedback())
    assert parsed.items[0].area == "loudness"
    assert parsed.items[0].evidence[0].value == 1.2
    assert parsed.caveats == []


def test_caveats_default_to_empty():
    data = feedback()
    del data["caveats"]
    assert Feedback.model_validate(data).caveats == []


def test_text_is_stripped():
    parsed = Feedback.model_validate(feedback(summary="  padded  "))
    assert parsed.summary == "padded"


@pytest.mark.parametrize("summary", ["", "   "])
def test_blank_summary_rejected(summary):
    with pytest.raises(ValidationError):
        Feedback.model_validate(feedback(summary=summary))


def test_items_cannot_be_empty():
    with pytest.raises(ValidationError):
        Feedback.model_validate(feedback(items=[]))


def test_too_many_items_rejected():
    with pytest.raises(ValidationError):
        Feedback.model_validate(feedback(items=[item() for _ in range(MAX_ITEMS + 1)]))
    # exactly the limit is fine
    Feedback.model_validate(feedback(items=[item() for _ in range(MAX_ITEMS)]))


def test_too_many_caveats_rejected():
    with pytest.raises(ValidationError):
        Feedback.model_validate(feedback(caveats=["x"] * (MAX_CAVEATS + 1)))


@pytest.mark.parametrize(
    "bad",
    [
        {"area": "melody"},
        {"priority": "critical"},
        {"observation": ""},
        {"suggestion": "x" * 601},
        {"evidence": []},
        {"evidence": [{"metric": "", "value": 1.0}]},
        {"evidence": [{"metric": "loudness.integrated_lufs", "value": "loud"}]},
        {"evidence": [{"metric": "a.b", "value": 1.0}] * (MAX_EVIDENCE_PER_ITEM + 1)},
    ],
)
def test_bad_item_rejected(bad):
    with pytest.raises(ValidationError):
        Feedback.model_validate(feedback(items=[item(**bad)]))


def test_unknown_fields_rejected():
    with pytest.raises(ValidationError):
        Feedback.model_validate(feedback(mood="great"))
    with pytest.raises(ValidationError):
        Feedback.model_validate(feedback(items=[item(extra=1)]))


def test_json_schema_for_the_model_has_no_meta_and_forbids_extras():
    schema = Feedback.model_json_schema()
    assert set(schema["properties"]) == {"summary", "items", "caveats"}
    assert schema["additionalProperties"] is False
    area_enum = schema["$defs"]["FeedbackItem"]["properties"]["area"]["enum"]
    assert "overall" in area_enum and "loudness" in area_enum


# --- StoredFeedback -------------------------------------------------------------------------


def test_stored_feedback_dumps_to_plain_json():
    stored = StoredFeedback(
        **Feedback.model_validate(feedback()).model_dump(),
        meta=FeedbackMeta(
            model="some-model",
            generated_at=datetime(2026, 10, 30, 12, 0, tzinfo=timezone.utc),
            context_used=FeedbackContext(genre="pop rock", target_platform="spotify", stage=Stage.DEMO),
        ),
    )
    dumped = stored.model_dump(mode="json")
    json.dumps(dumped)  # must be JSON-serialisable for the JSON column
    assert dumped["meta"]["model"] == "some-model"
    assert dumped["meta"]["context_used"]["stage"] == "demo"
    assert dumped["meta"]["generated_at"].startswith("2026-10-30T12:00:00")
    assert dumped["meta"]["feedback_schema_version"] == 1
    # And what we stored still validates when read back
    StoredFeedback.model_validate(dumped)


# --- settings -------------------------------------------------------------------------------


def test_feedback_settings_default_to_unconfigured(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_MODEL", raising=False)
    s = Settings(_env_file=None)
    assert s.anthropic_api_key is None
    assert s.anthropic_model is None
    assert s.feedback_timeout_seconds == 60
    assert s.feedback_max_tokens == 8192


def test_api_key_is_read_from_env_and_not_shown_in_repr(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-123")
    monkeypatch.setenv("ANTHROPIC_MODEL", "some-model")
    s = Settings(_env_file=None)
    assert s.anthropic_api_key.get_secret_value() == "sk-test-123"
    assert s.anthropic_model == "some-model"
    assert "sk-test-123" not in repr(s)
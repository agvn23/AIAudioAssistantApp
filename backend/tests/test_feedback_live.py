"""Opt-in test against the real provider. Skipped unless RUN_LIVE_TESTS=1: it needs a configured
key and can fail for reasons outside our code (free-tier quota, provider overload).

Run from backend/:   RUN_LIVE_TESTS=1 pytest tests/test_feedback_live.py -s
"""

import os

import pytest
from feedback_fakes import example_metrics

pytestmark = pytest.mark.skipif(
    not os.environ.get("RUN_LIVE_TESTS"), reason="set RUN_LIVE_TESTS=1 to call the real provider"
)


def test_real_provider_returns_valid_verified_feedback():
    from app.config import settings
    from app.services.feedback.errors import FeedbackError
    from app.services.feedback.generators import build_generator
    from app.services.feedback.schemas import StoredFeedback
    from app.services.feedback.service import generate_feedback

    try:
        generator = build_generator(settings)
        result = generate_feedback(
            generator,
            example_metrics(),
            genre="pop rock",
            target_platform="spotify",
            stage="demo",
        )
    except FeedbackError as exc:
        if exc.code in ("not_configured", "timeout", "provider_error"):
            pytest.skip(f"provider not usable right now: {exc.code}")
        raise  # invalid_output is our problem, not the provider's

    stored = StoredFeedback.model_validate(result)
    assert stored.meta.model == settings.gemini_model
    assert stored.items  # the service already verified every cited number

    print("\n" + stored.summary)
    for item in stored.items:
        print(f"[{item.priority}] {item.area}: {item.observation}\n    -> {item.suggestion}")
    for caveat in stored.caveats:
        print(f"caveat: {caveat}")
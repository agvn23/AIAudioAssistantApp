from types import SimpleNamespace

import pytest

from app.config import Settings
from app.services.feedback.errors import FeedbackError
from app.services.feedback.generators import GeminiGenerator, build_generator


class FakeModels:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.result


class FakeClient:
    def __init__(self, **kwargs):
        self.models = FakeModels(**kwargs)


def make(client):
    return GeminiGenerator(
        api_key="k", model="gemini-test", timeout_seconds=5, max_output_tokens=123, client=client
    )


def call(generator):
    return generator.generate(system_prompt="SYS", user_message="USER", json_schema={"type": "object"})


# --- GeminiGenerator -----------------------------------------------------------------------


def test_request_is_built_from_the_arguments():
    client = FakeClient(result=SimpleNamespace(text='{"ok": true}'))
    generator = make(client)

    assert call(generator) == '{"ok": true}'
    assert generator.model_name == "gemini-test"

    sent = client.models.calls[0]
    assert sent["model"] == "gemini-test"
    assert sent["contents"] == "USER"
    config = sent["config"]
    assert config["system_instruction"] == "SYS"
    assert config["response_mime_type"] == "application/json"
    assert config["response_json_schema"] == {"type": "object"}
    assert config["max_output_tokens"] == 123


def test_empty_response_becomes_empty_text():
    assert call(make(FakeClient(result=SimpleNamespace(text=None)))) == ""


class ReadTimeout(Exception):
    """Same name pattern as httpx's timeout exceptions."""


class WithCode(Exception):
    def __init__(self, code):
        super().__init__("provider said no, key=sk-secret")
        self.code = code


def raises(error):
    with pytest.raises(FeedbackError) as info:
        call(make(FakeClient(error=error)))
    return info.value


def test_timeouts_are_recognised():
    assert raises(ReadTimeout("slow")).code == "timeout"
    assert raises(TimeoutError()).code == "timeout"
    assert raises(WithCode(504)).code == "timeout"


def test_timeout_inside_the_cause_chain_is_recognised():
    try:
        try:
            raise ReadTimeout("slow")
        except ReadTimeout as inner:
            raise RuntimeError("wrapped") from inner
    except RuntimeError as wrapped:
        assert raises(wrapped).code == "timeout"


def test_rate_limit_message_mentions_the_quota():
    error = raises(WithCode(429))
    assert error.code == "provider_error"
    assert "quota" in error.message.lower()


def test_other_errors_become_provider_errors_without_leaking_details():
    error = raises(WithCode(500))
    assert error.code == "provider_error"
    assert "sk-secret" not in error.message
    assert raises(ValueError("boom")).code == "provider_error"


# --- build_generator -----------------------------------------------------------------------


def settings(**values):
    return Settings(_env_file=None, **values)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for name in ("FEEDBACK_PROVIDER", "GEMINI_API_KEY", "GEMINI_MODEL"):
        monkeypatch.delenv(name, raising=False)


@pytest.mark.parametrize(
    "values",
    [
        {},
        {"gemini_api_key": "k"},
        {"gemini_model": "m"},
        {"gemini_api_key": "  ", "gemini_model": "m"},
        {"gemini_api_key": "k", "gemini_model": "  "},
        {"feedback_provider": "nonsense", "gemini_api_key": "k", "gemini_model": "m"},
    ],
)
def test_unconfigured_settings_raise_not_configured(values):
    with pytest.raises(FeedbackError) as info:
        build_generator(settings(**values))
    assert info.value.code == "not_configured"


def test_configured_settings_build_a_gemini_generator():
    pytest.importorskip("google.genai")  # needs `pip install google-genai`
    generator = build_generator(settings(gemini_api_key="k", gemini_model="some-model"))
    assert isinstance(generator, GeminiGenerator)
    assert generator.model_name == "some-model"
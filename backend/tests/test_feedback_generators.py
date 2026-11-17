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


# --- model_version -------------------------------------------------------------------------


def test_model_version_is_recorded_from_the_response():
    client = FakeClient(result=SimpleNamespace(text="{}", model_version="gemini-test-001"))
    generator = make(client)
    assert generator.last_model_version is None  # nothing asked yet

    call(generator)

    assert generator.last_model_version == "gemini-test-001"
    assert generator.model_name == "gemini-test"  # the name asked for is unchanged


def test_model_version_is_stripped():
    generator = make(
        FakeClient(result=SimpleNamespace(text="{}", model_version="  gemini-test-001 "))
    )
    call(generator)
    assert generator.last_model_version == "gemini-test-001"


def test_model_version_is_none_when_the_response_has_none():
    generator = make(FakeClient(result=SimpleNamespace(text="{}")))
    call(generator)
    assert generator.last_model_version is None


@pytest.mark.parametrize("value", [5, "", "   ", ["gemini-test-001"]])
def test_unusable_model_versions_are_recorded_as_none(value):
    generator = make(FakeClient(result=SimpleNamespace(text="{}", model_version=value)))
    call(generator)
    assert generator.last_model_version is None


def test_model_version_is_cleared_when_the_next_call_fails():
    client = FakeClient(result=SimpleNamespace(text="{}", model_version="gemini-test-001"))
    generator = make(client)
    call(generator)
    assert generator.last_model_version == "gemini-test-001"

    client.models.error = ValueError("boom")
    with pytest.raises(FeedbackError):
        call(generator)

    assert generator.last_model_version is None


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


# --- retrying a 503 ------------------------------------------------------------------------


class ScriptedModels:
    """Returns or raises the scripted outcomes in order, one per call."""

    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class ScriptedClient:
    def __init__(self, *outcomes):
        self.models = ScriptedModels(*outcomes)


def answer(text="{}", version="gemini-test-001"):
    return SimpleNamespace(text=text, model_version=version)


def make_retrying(client, *, retries=2, delay=2.0):
    """A generator that retries a 503 and records its waits instead of sleeping."""
    sleeps = []
    generator = GeminiGenerator(
        api_key="k",
        model="gemini-test",
        timeout_seconds=5,
        max_output_tokens=123,
        client=client,
        retries=retries,
        retry_delay_seconds=delay,
        sleep=sleeps.append,
    )
    return generator, sleeps


def test_a_503_is_retried_and_the_answer_is_used():
    client = ScriptedClient(WithCode(503), answer('{"ok": true}', "gemini-test-002"))
    generator, sleeps = make_retrying(client)

    assert call(generator) == '{"ok": true}'

    assert len(client.models.calls) == 2
    assert sleeps == [2.0]
    assert generator.last_model_version == "gemini-test-002"


def test_a_503_that_clears_on_the_last_retry_succeeds():
    client = ScriptedClient(WithCode(503), WithCode(503), answer())
    generator, sleeps = make_retrying(client)

    assert call(generator) == "{}"

    assert len(client.models.calls) == 3
    assert sleeps == [2.0, 4.0]


def test_retries_stop_at_the_limit_and_the_delays_double():
    client = ScriptedClient(WithCode(503), WithCode(503), WithCode(503))
    generator, sleeps = make_retrying(client, retries=2, delay=1.5)

    with pytest.raises(FeedbackError) as info:
        call(generator)

    assert info.value.code == "provider_error"
    assert "sk-secret" not in info.value.message
    assert len(client.models.calls) == 3  # the first try plus two retries
    assert sleeps == [1.5, 3.0]
    assert generator.last_model_version is None


@pytest.mark.parametrize(
    "error",
    [WithCode(500), WithCode(429), WithCode(504), ReadTimeout("slow"), ValueError("boom")],
)
def test_other_errors_are_not_retried(error):
    client = ScriptedClient(error)
    generator, sleeps = make_retrying(client)

    with pytest.raises(FeedbackError):
        call(generator)

    assert len(client.models.calls) == 1
    assert sleeps == []


def test_a_retried_503_followed_by_a_timeout_gives_the_timeout():
    client = ScriptedClient(WithCode(503), ReadTimeout("slow"))
    generator, sleeps = make_retrying(client)

    with pytest.raises(FeedbackError) as info:
        call(generator)

    assert info.value.code == "timeout"
    assert len(client.models.calls) == 2
    assert sleeps == [2.0]


def test_there_are_no_retries_by_default():
    client = ScriptedClient(WithCode(503))

    with pytest.raises(FeedbackError) as info:
        call(make(client))

    assert info.value.code == "provider_error"
    assert len(client.models.calls) == 1


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


def test_the_retry_settings_reach_the_generator():
    pytest.importorskip("google.genai")
    generator = build_generator(
        settings(
            gemini_api_key="k",
            gemini_model="some-model",
            feedback_provider_retries=1,
            feedback_provider_retry_delay_seconds=0.5,
        )
    )
    assert generator.retries == 1
    assert generator.retry_delay_seconds == 0.5


def test_default_settings_retry_a_503_twice_after_two_seconds(monkeypatch):
    pytest.importorskip("google.genai")
    monkeypatch.delenv("FEEDBACK_PROVIDER_RETRIES", raising=False)
    monkeypatch.delenv("FEEDBACK_PROVIDER_RETRY_DELAY_SECONDS", raising=False)
    generator = build_generator(settings(gemini_api_key="k", gemini_model="some-model"))
    assert generator.retries == 2
    assert generator.retry_delay_seconds == 2.0

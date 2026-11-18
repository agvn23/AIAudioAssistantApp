import pytest

from app.config import DEV_CORS_ORIGINS, Settings

SECRET = "a-long-random-secret-for-the-tests-0123456789"


def make_settings(**overrides) -> Settings:
    # Keyword arguments beat environment variables, and _env_file=None ignores backend/.env,
    # so these tests do not depend on the machine they run on.
    return Settings(_env_file=None, **overrides)


def test_development_defaults_to_the_vite_origins():
    settings = make_settings(environment="development", cors_origins=None)
    assert settings.cors_origin_list == list(DEV_CORS_ORIGINS)


def test_other_environments_default_to_no_cross_origin_access():
    settings = make_settings(environment="production", jwt_secret=SECRET, cors_origins=None)
    assert settings.cors_origin_list == []


def test_origins_are_split_trimmed_and_lose_trailing_slashes():
    settings = make_settings(cors_origins=" https://a.example , https://b.example/ ,")
    assert settings.cors_origin_list == ["https://a.example", "https://b.example"]


def test_an_empty_value_means_no_origins_even_in_development():
    assert make_settings(environment="development", cors_origins="").cors_origin_list == []


@pytest.mark.parametrize("value", ["*", "https://a.example,*"])
def test_a_wildcard_origin_is_rejected(value):
    with pytest.raises(ValueError, match="explicit origins"):
        make_settings(cors_origins=value)


# --- feedback provider retries ---------------------------------------------------------------


def test_feedback_retry_settings_default_to_two_retries_starting_at_two_seconds(monkeypatch):
    monkeypatch.delenv("FEEDBACK_PROVIDER_RETRIES", raising=False)
    monkeypatch.delenv("FEEDBACK_PROVIDER_RETRY_DELAY_SECONDS", raising=False)
    settings = make_settings()
    assert settings.feedback_provider_retries == 2
    assert settings.feedback_provider_retry_delay_seconds == 2.0


@pytest.mark.parametrize("value", [-1, 6])
def test_feedback_provider_retries_must_be_between_0_and_5(value):
    with pytest.raises(ValueError):
        make_settings(feedback_provider_retries=value)


@pytest.mark.parametrize("value", [-0.1, 30.1])
def test_feedback_retry_delay_must_be_between_0_and_30_seconds(value):
    with pytest.raises(ValueError):
        make_settings(feedback_provider_retry_delay_seconds=value)


def test_the_edges_of_the_retry_ranges_are_accepted():
    low = make_settings(feedback_provider_retries=0, feedback_provider_retry_delay_seconds=0)
    high = make_settings(feedback_provider_retries=5, feedback_provider_retry_delay_seconds=30)
    assert (low.feedback_provider_retries, low.feedback_provider_retry_delay_seconds) == (0, 0.0)
    assert (high.feedback_provider_retries, high.feedback_provider_retry_delay_seconds) == (5, 30.0)

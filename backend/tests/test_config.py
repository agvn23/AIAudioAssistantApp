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

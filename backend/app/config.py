from __future__ import annotations

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Only for local development. Any other environment must set JWT_SECRET.
DEV_JWT_SECRET = "dev-only-secret-change-me-0123456789abcdef"

# The Vite dev server. Used only when ENVIRONMENT=development and CORS_ORIGINS is not set.
DEV_CORS_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")

# Upload allow-list. Content is checked for real by ffmpeg/ffprobe during analysis;
# this only decides which files we are willing to write to disk at all.
ALLOWED_AUDIO_EXTENSIONS = frozenset({".wav", ".mp3", ".flac", ".aif", ".aiff", ".m4a", ".ogg"})

_PERIOD_SECONDS = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}


def parse_rate(value: str) -> tuple[int, int]:
    """'10/hour' -> (10, 3600): at most 10 requests per 3600 seconds."""
    try:
        count_text, period = value.strip().lower().split("/")
        count = int(count_text)
        seconds = _PERIOD_SECONDS[period.strip()]
    except (ValueError, KeyError):
        raise ValueError(
            f"invalid rate {value!r}: use COUNT/PERIOD such as '10/hour' "
            f"(periods: {', '.join(_PERIOD_SECONDS)})"
        ) from None
    if count < 1:
        raise ValueError(f"invalid rate {value!r}: the count must be at least 1")
    return count, seconds


# Settings that hold a rate. Only the global feedback cap may be left empty (= off).
_RATE_FIELDS = (
    "rate_limit_register",
    "rate_limit_login",
    "rate_limit_upload",
    "rate_limit_feedback",
    "rate_limit_delete_account",
)


class Settings(BaseSettings):
    """Settings come from environment variables (and an optional backend/.env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "sqlite:///./app.db"
    jwt_secret: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30

    # Browser origins allowed to call the API, comma-separated (the frontend's address, e.g.
    # "https://app.example.com"). Unset: the Vite dev origins in development, none elsewhere.
    # Set but empty: none. "*" is rejected on purpose.
    cors_origins: str | None = None

    max_upload_mb: int = 100
    # Largest request body for everything that is not an audio upload (JSON bodies are tiny).
    max_request_body_kb: int = 256
    upload_tmp_dir: str | None = None  # None = the system temp directory (tests point it elsewhere)

    # Rate limits, "COUNT/PERIOD" with PERIOD one of second, minute, hour, day. They live in
    # memory: they reset when the server restarts and are per process (fine for one process).
    rate_limit_enabled: bool = True
    rate_limit_register: str = "5/hour"  # per client IP
    rate_limit_login: str = "10/minute"  # per client IP
    rate_limit_upload: str = "20/hour"  # per user
    rate_limit_feedback: str = "10/hour"  # per user; each call spends Gemini free-tier quota
    # One budget shared by all users, so the whole app stays inside the free tier. Empty = off.
    rate_limit_feedback_global: str = "200/day"
    rate_limit_delete_account: str = "5/hour"  # per user (each try runs an Argon2 verification)

    # Quotas and capacity.
    max_tracks_per_user: int = 200
    max_analyses_per_track: int = 50
    max_active_analyses_per_user: int = 2  # pending + running
    max_active_analyses_global: int = 10  # pending + running, all users; beyond this: 503
    max_concurrent_analyses: int = 2  # analyses actually running at once (ffmpeg + essentia)

    # AI feedback. Providers are optional at startup: without a configured one the feedback
    # endpoint answers 503 and everything else keeps working. Only "gemini" is implemented.
    feedback_provider: str = "gemini"
    gemini_api_key: SecretStr | None = None
    gemini_model: str | None = None
    # Kept for a possible Anthropic provider later; currently unused.
    anthropic_api_key: SecretStr | None = None
    anthropic_model: str | None = None
    feedback_timeout_seconds: float = 60.0
    # Generous on purpose: on some models the internal "thinking" counts against this limit.
    feedback_max_tokens: int = 8192

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins is None:
            return list(DEV_CORS_ORIGINS) if self.environment == "development" else []
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @model_validator(mode="after")
    def _require_real_secret_outside_development(self) -> "Settings":
        if self.environment != "development" and self.jwt_secret == DEV_JWT_SECRET:
            raise ValueError("JWT_SECRET must be set when ENVIRONMENT is not 'development'")
        return self

    @model_validator(mode="after")
    def _cors_origins_are_explicit(self) -> "Settings":
        if "*" in self.cors_origin_list:
            raise ValueError("CORS_ORIGINS must list explicit origins, not '*'")
        return self

    @model_validator(mode="after")
    def _rates_are_valid(self) -> "Settings":
        for name in _RATE_FIELDS:
            parse_rate(getattr(self, name))  # a typo fails at startup, not on the first request
        if self.rate_limit_feedback_global.strip():
            parse_rate(self.rate_limit_feedback_global)
        return self


settings = Settings()

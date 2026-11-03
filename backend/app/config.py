from __future__ import annotations

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Only for local development. Any other environment must set JWT_SECRET.
DEV_JWT_SECRET = "dev-only-secret-change-me-0123456789abcdef"

# Upload allow-list. Content is checked for real by ffmpeg/ffprobe during analysis;
# this only decides which files we are willing to write to disk at all.
ALLOWED_AUDIO_EXTENSIONS = frozenset({".wav", ".mp3", ".flac", ".aif", ".aiff", ".m4a", ".ogg"})


class Settings(BaseSettings):
    """Settings come from environment variables (and an optional backend/.env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "sqlite:///./app.db"
    jwt_secret: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30

    max_upload_mb: int = 100
    upload_tmp_dir: str | None = None  # None = the system temp directory (tests point it elsewhere)

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

    @model_validator(mode="after")
    def _require_real_secret_outside_development(self) -> "Settings":
        if self.environment != "development" and self.jwt_secret == DEV_JWT_SECRET:
            raise ValueError("JWT_SECRET must be set when ENVIRONMENT is not 'development'")
        return self


settings = Settings()
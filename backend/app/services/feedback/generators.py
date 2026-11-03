"""The only place that talks to an LLM provider. A generator takes the prompts and a JSON
schema and returns the model's raw text; parsing, validation and retries live in service.py,
so they work the same for every provider."""

from __future__ import annotations

import logging
from typing import Any, Protocol

from ...config import Settings
from .errors import FeedbackError

logger = logging.getLogger(__name__)

TEMPERATURE = 0.2


class FeedbackGenerator(Protocol):
    model_name: str

    def generate(self, *, system_prompt: str, user_message: str, json_schema: dict[str, Any]) -> str:
        """Return the model's raw text answer. Raise FeedbackError for provider problems."""
        ...


def _is_timeout(exc: BaseException | None) -> bool:
    """Timeouts surface as different exception types depending on the HTTP layer, so look at
    the whole cause chain by name instead of importing every possible class."""
    seen: set[int] = set()
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc))
        if isinstance(exc, TimeoutError) or "timeout" in type(exc).__name__.lower():
            return True
        if getattr(exc, "code", None) == 504:
            return True
        exc = exc.__cause__ or exc.__context__
    return False


def _translate(exc: Exception) -> FeedbackError:
    """Turn any SDK or network error into a FeedbackError. Only the exception type and status
    code are logged, never the message: it could contain request details."""
    code = getattr(exc, "code", None)
    logger.warning("feedback provider call failed: %s (code=%s)", type(exc).__name__, code)
    if _is_timeout(exc):
        return FeedbackError("timeout", "The AI provider took too long to answer. Try again.")
    if code == 429:
        return FeedbackError(
            "provider_error",
            "The AI provider's rate limit or free quota was reached. Try again later.",
        )
    return FeedbackError("provider_error", "The AI provider returned an error. Try again later.")


class GeminiGenerator:
    """Google Gemini through the `google-genai` SDK, with JSON-schema constrained output."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_seconds: float,
        max_output_tokens: int,
        client: Any | None = None,
    ) -> None:
        self.model_name = model
        self._max_output_tokens = max_output_tokens
        if client is None:
            from google import genai
            from google.genai import types

            client = genai.Client(
                api_key=api_key,
                http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000)),  # ms
            )
        self._client = client

    def generate(self, *, system_prompt: str, user_message: str, json_schema: dict[str, Any]) -> str:
        config = {
            "system_instruction": system_prompt,
            "response_mime_type": "application/json",
            "response_json_schema": json_schema,
            "max_output_tokens": self._max_output_tokens,
            "temperature": TEMPERATURE,
        }
        try:
            response = self._client.models.generate_content(
                model=self.model_name, contents=user_message, config=config
            )
        except Exception as exc:
            raise _translate(exc) from exc
        return getattr(response, "text", None) or ""


def build_generator(settings: Settings) -> FeedbackGenerator:
    """The generator for the configured provider, or FeedbackError('not_configured')."""
    not_configured = FeedbackError("not_configured", "AI feedback is not configured on this server.")

    if settings.feedback_provider.strip().lower() != "gemini":
        raise not_configured

    api_key = settings.gemini_api_key.get_secret_value().strip() if settings.gemini_api_key else ""
    model = (settings.gemini_model or "").strip()
    if not api_key or not model:
        raise not_configured

    return GeminiGenerator(
        api_key=api_key,
        model=model,
        timeout_seconds=settings.feedback_timeout_seconds,
        max_output_tokens=settings.feedback_max_tokens,
    )
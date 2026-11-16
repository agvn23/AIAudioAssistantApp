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
    """A generator may also expose `last_model_version: str | None`, the model name the
    provider reported for the most recent call (None when unknown or when that call failed).
    It is optional: service.py reads it with getattr, so a generator without it still works."""

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


def _reported_model_version(response: Any) -> str | None:
    """The `model_version` of a Gemini response as clean text, or None when it is missing or
    not a non-empty string."""
    value = getattr(response, "model_version", None)
    if not isinstance(value, str):
        return None
    return value.strip() or None


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
        # What Gemini says answered the most recent call. It can differ from `model_name`
        # (on 2026-11-15 a request for gemini-3.5-flash was answered by gemini-3.6-flash).
        self.last_model_version: str | None = None
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
        self.last_model_version = None  # a failed call must not leave the previous answer's value
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
        self.last_model_version = _reported_model_version(response)
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

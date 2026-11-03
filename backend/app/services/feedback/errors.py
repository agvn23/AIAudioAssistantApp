"""Expected failures of the feedback feature. The API maps `code` to an HTTP status; the
message is safe to show to the client (never contains provider error text)."""

from __future__ import annotations

STATUS_FOR_CODE = {
    "not_configured": 503,
    "timeout": 504,
    "provider_error": 502,
    "invalid_output": 502,
}


class FeedbackError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
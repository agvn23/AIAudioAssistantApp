"""Request body size limits.

Two limits: audio uploads (`POST /tracks/{id}/analyses`) get MAX_UPLOAD_MB plus room for the
multipart framing; every other request gets MAX_REQUEST_BODY_KB, since JSON bodies are tiny.

A declared Content-Length over the limit is rejected before the body is read. Bodies without
one (chunked), or whose real size does not match what they declare, are counted as they stream
in and cut off with 413 as soon as they go over.

Limitation: this protects the app, not the network. A reverse proxy in front of the server
should enforce the same ceiling so oversized bodies never reach Python at all.
"""

from __future__ import annotations

import re
from collections.abc import Callable

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import settings
from .error_handling import ApiError, error_response

_UPLOAD_PATH = re.compile(r"^/tracks/\d+/analyses/?$")
MULTIPART_OVERHEAD_BYTES = 1024 * 1024
_TOO_LARGE_MESSAGE = "Request body is too large"


def request_limit_bytes(method: str, path: str) -> int | None:
    """The body limit for a request, or None for no limit. Reads the settings on every call."""
    if method == "POST" and _UPLOAD_PATH.match(path):
        return settings.max_upload_mb * 1024 * 1024 + MULTIPART_OVERHEAD_BYTES
    return settings.max_request_body_kb * 1024


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, limit_for: Callable[[str, str], int | None]) -> None:
        self.app = app
        self.limit_for = limit_for

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self.limit_for(scope["method"], scope["path"])
        if limit is None:
            await self.app(scope, receive, send)
            return

        declared = Headers(scope=scope).get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            response = error_response(413, "payload_too_large", _TOO_LARGE_MESSAGE)
            await response(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # An ApiError (FastAPI's HTTPException): FastAPI re-raises it while reading
                    # the body, and the error handlers turn it into the 413 envelope.
                    raise ApiError(413, _TOO_LARGE_MESSAGE, code="payload_too_large")
            return message

        await self.app(scope, limited_receive, send)

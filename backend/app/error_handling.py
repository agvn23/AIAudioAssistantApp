"""One error format for the whole API.

Every error response looks like this:

    {"error": {"code": "not_found", "message": "Track not found"}}

* `code` is a stable, machine-readable string the frontend can branch on.
* `message` is safe to show to a person.
* 422 responses add `fields`, one entry per invalid input (the submitted value is never echoed,
  so a rejected password does not come back in the response).
* Unexpected exceptions become a generic 500 that carries a `request_id`. The traceback goes to
  the server log only, together with the same id. Every response has an `X-Request-ID` header.

The catch-all for unexpected exceptions is a middleware, not an exception handler: Starlette's
built-in 500 handler sits outside the CORS middleware, so a 500 produced there would carry no
CORS headers and the browser would report a CORS error instead of the real one. Our middleware
sits inside CORS (see main.py).
"""

from __future__ import annotations

import logging
import uuid
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.datastructures import MutableHeaders
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"

_CODE_FOR_STATUS = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    502: "bad_gateway",
    503: "service_unavailable",
    504: "gateway_timeout",
}


# --- OpenAPI models (documentation only; responses are built by hand below) ----------------------


class FieldError(BaseModel):
    location: str  # body, query, path, header, ...
    field: str  # dotted path inside the location, e.g. "tags" or "items.0.name"; "" if the whole location
    message: str


class ErrorBody(BaseModel):
    code: str
    message: str
    fields: list[FieldError] | None = None
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorResponse, "description": "Validation error"},
    500: {"model": ErrorResponse, "description": "Unexpected server error"},
}


# --- raising errors with an explicit code --------------------------------------------------------


class ApiError(HTTPException):
    """An HTTP error with a specific machine-readable code, for cases where the status alone is
    not enough (for example 403 `invalid_password`). Plain HTTPException still works and gets
    the default code for its status.

    It derives from FastAPI's HTTPException (not Starlette's) on purpose: when FastAPI fails
    while reading a request body it turns every other exception into a 400, but it re-raises
    its own HTTPException unchanged. The body-size middleware relies on that to answer 413."""

    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        code: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=message, headers=headers)
        self.code = code


# --- building responses --------------------------------------------------------------------------


def error_response(
    status_code: int,
    code: str,
    message: str,
    *,
    fields: list[dict[str, str]] | None = None,
    request_id: str | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {"code": code, "message": message}
    if fields is not None:
        body["fields"] = fields
    if request_id is not None:
        body["request_id"] = request_id
    return JSONResponse({"error": body}, status_code=status_code, headers=headers)


def _default_code(status_code: int) -> str:
    return _CODE_FOR_STATUS.get(status_code, "client_error" if status_code < 500 else "server_error")


def _phrase(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return "Error"


async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handles our own HTTPException/ApiError and Starlette's (unknown route, wrong method)."""
    message = exc.detail if isinstance(exc.detail, str) and exc.detail else _phrase(exc.status_code)
    code = getattr(exc, "code", None) or _default_code(exc.status_code)
    # exc.headers matters: 401 needs WWW-Authenticate, 405 needs Allow.
    return error_response(exc.status_code, code, message, headers=exc.headers)


async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    fields: list[dict[str, str]] = []
    for error in exc.errors():
        loc = [str(part) for part in error.get("loc", ())]
        message = str(error.get("msg", "Invalid value")).removeprefix("Value error, ")
        # Deliberately no "input" and no "ctx": the input can be a password.
        fields.append(
            {
                "location": loc[0] if loc else "body",
                "field": ".".join(loc[1:]),
                "message": message,
            }
        )
    return error_response(422, "validation_error", "Request validation failed", fields=fields)


class RequestContextMiddleware:
    """Gives every request an id (X-Request-ID response header) and turns any unexpected
    exception into a generic 500 whose details only reach the server log."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        response_started = False

        async def send_with_request_id(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            # Method and path only: never the query string, headers or body.
            logger.exception(
                "unhandled error (request_id=%s) %s %s",
                request_id,
                scope.get("method"),
                scope.get("path"),
            )
            if response_started:
                raise  # too late to change the response; let the server close the connection
            response = error_response(
                500, "internal_error", "Internal server error", request_id=request_id
            )
            await response(scope, receive, send_with_request_id)


def install_error_handling(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_middleware(RequestContextMiddleware)

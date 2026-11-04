import logging
import re

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.error_handling import ApiError, install_error_handling

PASSWORD = "correct horse battery"


def make_app() -> FastAPI:
    """A throwaway app with the same error handling and a few routes that fail on purpose."""
    app = FastAPI()
    install_error_handling(app)

    @app.get("/boom")
    def boom():
        raise RuntimeError("secret detail at /Users/me/private/mix.wav")

    @app.get("/api-error")
    def api_error():
        raise ApiError(403, "Incorrect password", code="invalid_password", headers={"X-Extra": "1"})

    @app.get("/odd-detail")
    def odd_detail():
        raise HTTPException(status_code=400, detail={"anything": ["goes"]})

    return app


@pytest.fixture()
def failing_client():
    return TestClient(make_app())


# --- unexpected exceptions ---------------------------------------------------------------------


def test_unexpected_exception_becomes_a_generic_500(failing_client, caplog):
    with caplog.at_level(logging.ERROR, logger="app.error_handling"):
        r = failing_client.get("/boom")

    assert r.status_code == 500
    error = r.json()["error"]
    assert error["code"] == "internal_error"
    assert error["message"] == "Internal server error"
    # Nothing about the exception leaks to the client.
    assert "secret detail" not in r.text and "/Users/me" not in r.text
    assert "Traceback" not in r.text


def test_the_500_carries_a_request_id_that_is_also_in_the_header_and_the_log(
    failing_client, caplog
):
    with caplog.at_level(logging.ERROR, logger="app.error_handling"):
        r = failing_client.get("/boom")

    request_id = r.json()["error"]["request_id"]
    assert re.fullmatch(r"[0-9a-f]{32}", request_id)
    assert r.headers["x-request-id"] == request_id
    assert request_id in caplog.text  # so a reported id can be found in the logs
    assert any(rec.exc_info and rec.exc_info[0] is RuntimeError for rec in caplog.records)


# --- explicit codes, odd details ---------------------------------------------------------------


def test_api_error_uses_its_own_code_and_keeps_headers(failing_client):
    r = failing_client.get("/api-error")
    assert r.status_code == 403
    assert r.json() == {"error": {"code": "invalid_password", "message": "Incorrect password"}}
    assert r.headers["x-extra"] == "1"


def test_a_non_string_detail_falls_back_to_the_status_phrase(failing_client):
    r = failing_client.get("/odd-detail")
    assert r.status_code == 400
    assert r.json() == {"error": {"code": "bad_request", "message": "Bad Request"}}


# --- the real app ------------------------------------------------------------------------------


def test_unknown_route_uses_the_envelope(client):
    r = client.get("/no-such-route")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "not_found", "message": "Not Found"}}


def test_wrong_method_keeps_the_allow_header(client):
    r = client.post("/health")
    assert r.status_code == 405
    assert r.json()["error"]["code"] == "method_not_allowed"
    assert "GET" in r.headers["allow"]


def test_401_keeps_www_authenticate(client):
    r = client.get("/users/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"
    assert r.headers["www-authenticate"] == "Bearer"


def test_validation_errors_list_the_fields_and_never_echo_the_input(client):
    r = client.post("/auth/register", json={"email": "a@example.com", "password": "x9q!"})
    assert r.status_code == 422
    error = r.json()["error"]
    assert error["code"] == "validation_error"
    fields = {(f["location"], f["field"]) for f in error["fields"]}
    assert ("body", "password") in fields
    assert "x9q!" not in r.text  # FastAPI's default 422 would echo the rejected value


def test_validator_messages_lose_the_pydantic_prefix(client):
    client.post("/auth/register", json={"email": "p@example.com", "password": PASSWORD})
    token = client.post(
        "/auth/login", data={"username": "p@example.com", "password": PASSWORD}
    ).json()["access_token"]

    r = client.post(
        "/tracks",
        json={"title": "T", "tags": [" "]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422
    field = r.json()["error"]["fields"][0]
    assert field["field"] == "tags"
    assert field["message"] == "tag names cannot be blank"


# --- request id and OpenAPI --------------------------------------------------------------------


def test_every_response_has_a_fresh_request_id(client):
    first = client.get("/health").headers["x-request-id"]
    second = client.get("/health").headers["x-request-id"]
    assert re.fullmatch(r"[0-9a-f]{32}", first)
    assert first != second
    assert "x-request-id" in client.get("/no-such-route").headers


def test_openapi_documents_the_error_schema(client):
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert "ErrorResponse" in schemas
    assert "HTTPValidationError" not in schemas

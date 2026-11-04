from app.config import settings
from app.deps import get_current_user
from app.main import app

ORIGIN = "http://localhost:5173"  # pinned in conftest.py
OTHER_ORIGIN = "http://evil.example"
PASSWORD = "correct horse battery"


def test_preflight_from_the_frontend_origin_is_allowed(client):
    r = client.options(
        "/tracks",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == ORIGIN
    allowed_methods = r.headers["access-control-allow-methods"]
    assert "DELETE" in allowed_methods and "PATCH" in allowed_methods
    assert "PUT" not in allowed_methods
    assert "access-control-allow-credentials" not in r.headers


def test_preflight_from_another_origin_is_refused(client):
    r = client.options(
        "/tracks",
        headers={"Origin": OTHER_ORIGIN, "Access-Control-Request-Method": "POST"},
    )
    assert r.status_code == 400
    assert "access-control-allow-origin" not in r.headers


def test_actual_request_from_the_frontend_origin_gets_cors_headers(client):
    r = client.get("/health", headers={"Origin": ORIGIN})
    assert r.headers["access-control-allow-origin"] == ORIGIN
    # The browser may read these from JavaScript:
    exposed = r.headers["access-control-expose-headers"]
    assert "X-Request-ID" in exposed and "Retry-After" in exposed


def test_requests_from_other_origins_get_no_cors_headers(client):
    r = client.get("/health", headers={"Origin": OTHER_ORIGIN})
    assert r.status_code == 200
    assert "access-control-allow-origin" not in r.headers


def test_requests_without_an_origin_get_no_cors_headers(client):
    assert "access-control-allow-origin" not in client.get("/health").headers


def test_error_responses_carry_cors_headers_so_the_frontend_can_read_them(client):
    unauthorized = client.get("/users/me", headers={"Origin": ORIGIN})
    assert unauthorized.status_code == 401
    assert unauthorized.headers["access-control-allow-origin"] == ORIGIN

    missing = client.get("/no-such-route", headers={"Origin": ORIGIN})
    assert missing.status_code == 404
    assert missing.headers["access-control-allow-origin"] == ORIGIN


def test_a_413_from_the_body_size_middleware_carries_cors_headers(client, monkeypatch):
    monkeypatch.setattr(settings, "max_request_body_kb", 1)
    r = client.post(
        "/auth/register",
        json={"email": "a@example.com", "password": "x" * 3000},
        headers={"Origin": ORIGIN},
    )
    assert r.status_code == 413
    assert r.headers["access-control-allow-origin"] == ORIGIN


def test_a_500_still_carries_cors_headers(client, monkeypatch):
    """The reason the catch-all is a middleware inside CORS rather than an exception handler."""

    def explode():
        raise RuntimeError("boom")

    monkeypatch.setitem(app.dependency_overrides, get_current_user, explode)
    r = client.get("/users/me", headers={"Origin": ORIGIN})
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "internal_error"
    assert r.headers["access-control-allow-origin"] == ORIGIN
    assert "x-request-id" in r.headers

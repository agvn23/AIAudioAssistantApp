import asyncio
import json

from fastapi import FastAPI, Request
from sqlalchemy import func, select

from app.config import settings
from app.db import SessionLocal
from app.error_handling import install_error_handling
from app.models import Analysis
from app.request_limits import BodySizeLimitMiddleware, request_limit_bytes

PASSWORD = "correct horse battery"
MB = 1024 * 1024


# --- the middleware itself, driven at ASGI level so chunked bodies can be simulated -------------


def make_app(limit_for):
    """A small app with the same middleware order as main.py, plus two routes that read a body."""
    app = FastAPI()
    app.add_middleware(BodySizeLimitMiddleware, limit_for=limit_for)
    install_error_handling(app)
    calls: list[int] = []

    @app.post("/echo")
    async def echo(request: Request):
        calls.append(1)
        return {"size": len(await request.body())}

    @app.post("/echo-json")
    async def echo_json(payload: dict):  # FastAPI itself reads (and wraps errors from) the body
        calls.append(1)
        return {"keys": list(payload)}

    return app, calls


def call_asgi(app, *, path="/echo", headers=(), chunks=()):
    """POST `chunks` as the request body and return (status, parsed JSON). No Content-Length is
    sent unless it is passed in `headers`, which is what a chunked upload looks like."""
    queue = list(chunks)

    async def receive():
        if queue:
            body = queue.pop(0)
            return {"type": "http.request", "body": body, "more_body": bool(queue)}
        return {"type": "http.disconnect"}

    sent = []

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "root_path": "",
        "query_string": b"",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers],
        "client": ("test", 1234),
        "server": ("test", 80),
    }
    asyncio.run(app(scope, receive, send))
    status = next(m["status"] for m in sent if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    return status, json.loads(body)


def test_a_body_within_the_limit_passes():
    app, calls = make_app(lambda method, path: 10)
    status, body = call_asgi(app, chunks=[b"12345", b"67890"])  # exactly 10 bytes
    assert (status, body) == (200, {"size": 10})
    assert calls == [1]


def test_a_declared_content_length_over_the_limit_is_rejected_before_the_route_runs():
    app, calls = make_app(lambda method, path: 10)
    status, body = call_asgi(app, headers=[("content-length", "50")], chunks=[b"x" * 50])
    assert status == 413
    assert body["error"]["code"] == "payload_too_large"
    assert calls == []


def test_a_chunked_body_is_cut_off_once_it_goes_over_the_limit():
    app, calls = make_app(lambda method, path: 10)
    status, body = call_asgi(app, chunks=[b"123456", b"78901"])  # 11 bytes, no Content-Length
    assert status == 413
    assert body == {"error": {"code": "payload_too_large", "message": "Request body is too large"}}


def test_a_body_larger_than_it_declared_is_still_caught():
    app, _ = make_app(lambda method, path: 10)
    status, body = call_asgi(app, headers=[("content-length", "5")], chunks=[b"x" * 20])
    assert status == 413
    assert body["error"]["code"] == "payload_too_large"


def test_fastapi_body_parsing_does_not_turn_the_413_into_a_400():
    """FastAPI converts unknown exceptions while reading a body into 400; ApiError is its own
    HTTPException subclass, so it comes through untouched."""
    app, calls = make_app(lambda method, path: 20)
    chunks = [b'{"a": "', b"x" * 50, b'"}']
    status, body = call_asgi(app, path="/echo-json", chunks=chunks)
    assert status == 413
    assert body["error"]["code"] == "payload_too_large"
    assert calls == []


def test_no_limit_means_no_limit():
    app, _ = make_app(lambda method, path: None)
    status, body = call_asgi(app, chunks=[b"x" * 5000])
    assert (status, body) == (200, {"size": 5000})


# --- which limit applies to which request ------------------------------------------------------


def test_uploads_get_the_upload_limit_and_everything_else_the_small_one(monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 5)
    monkeypatch.setattr(settings, "max_request_body_kb", 64)
    upload = 5 * MB + MB  # the file limit plus room for multipart framing

    assert request_limit_bytes("POST", "/tracks/12/analyses") == upload
    assert request_limit_bytes("POST", "/tracks/12/analyses/") == upload

    small = 64 * 1024
    assert request_limit_bytes("POST", "/tracks") == small
    assert request_limit_bytes("PATCH", "/analyses/3") == small
    assert request_limit_bytes("GET", "/tracks/12/analyses") == small  # not an upload
    assert request_limit_bytes("POST", "/tracks/12/analyses/extra") == small
    assert request_limit_bytes("POST", "/tracks/abc/analyses") == small


# --- the real app ------------------------------------------------------------------------------


def make_track(client):
    client.post("/auth/register", json={"email": "p@example.com", "password": PASSWORD})
    token = client.post(
        "/auth/login", data={"username": "p@example.com", "password": PASSWORD}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    track_id = client.post("/tracks", json={"title": "Song"}, headers=headers).json()["id"]
    return headers, track_id


def analysis_count() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(Analysis))


def test_an_oversized_json_body_gets_413_and_normal_ones_still_work(client, monkeypatch):
    monkeypatch.setattr(settings, "max_request_body_kb", 1)

    too_big = client.post(
        "/auth/register", json={"email": "a@example.com", "password": "x" * 3000}
    )
    assert too_big.status_code == 413
    assert too_big.json()["error"]["code"] == "payload_too_large"

    ok = client.post("/auth/register", json={"email": "a@example.com", "password": PASSWORD})
    assert ok.status_code == 201


def test_an_upload_far_over_the_limit_is_rejected_by_the_middleware(client, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    headers, track_id = make_track(client)

    r = client.post(
        f"/tracks/{track_id}/analyses",
        files={"file": ("mix.wav", b"0" * (3 * MB), "audio/wav")},  # over 1 MB + framing room
        headers=headers,
    )

    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"
    assert analysis_count() == 0


def test_an_upload_slightly_over_the_limit_is_still_caught_by_the_route(client, monkeypatch):
    """Between MAX_UPLOAD_MB and MAX_UPLOAD_MB plus the framing allowance, the middleware lets the
    request through and the route's own check answers with its more specific message."""
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    headers, track_id = make_track(client)

    r = client.post(
        f"/tracks/{track_id}/analyses",
        files={"file": ("mix.wav", b"0" * (MB + MB // 2), "audio/wav")},
        headers=headers,
    )

    assert r.status_code == 413
    assert "larger than 1 MB" in r.json()["error"]["message"]
    assert analysis_count() == 0

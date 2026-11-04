import threading
import time

import pytest
from sqlalchemy import update

from app.config import settings
from app.db import SessionLocal
from app.deps import get_feedback_generator_factory
from app.main import app
from app.models import Analysis, AnalysisStatus
from app.services import analysis_runner
from app.services.analysis_runner import remove_quietly
from app.services.feedback.errors import FeedbackError

PASSWORD = "correct horse battery"


# --- helpers -----------------------------------------------------------------------------------


@pytest.fixture()
def limits_on(monkeypatch):
    """Rate limiting is switched off for the rest of the suite (see conftest.py)."""
    monkeypatch.setattr(settings, "rate_limit_enabled", True)


@pytest.fixture()
def stub_analysis(monkeypatch):
    """Uploads are accepted but never analysed: the rows stay 'pending', and the temp file is
    removed like the real task would. No ffmpeg involved."""

    def stub(analysis_id, temp_path, context, filename):
        remove_quietly(temp_path)

    monkeypatch.setattr("app.routers.analyses.run_analysis", stub)


@pytest.fixture()
def no_feedback_provider(monkeypatch):
    """Every feedback call reaches the generator and fails with 503, without touching Gemini."""

    def factory():
        def build():
            raise FeedbackError("not_configured", "Feedback is not configured")

        return build

    monkeypatch.setitem(app.dependency_overrides, get_feedback_generator_factory, factory)


def make_user(client, email):
    client.post("/auth/register", json={"email": email, "password": PASSWORD})
    token = client.post(
        "/auth/login", data={"username": email, "password": PASSWORD}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def make_track(client, headers, title="Song"):
    r = client.post("/tracks", json={"title": title}, headers=headers)
    assert r.status_code == 201
    return r.json()["id"]


def upload(client, headers, track_id):
    return client.post(
        f"/tracks/{track_id}/analyses",
        files={"file": ("mix.wav", b"RIFF....WAVE", "audio/wav")},
        headers=headers,
    )


def add_done_analysis(track_id):
    with SessionLocal() as db:
        analysis = Analysis(
            track_id=track_id,
            version_number=1,
            original_filename="mix.wav",
            status="done",
            metrics={"loudness": {"integrated_lufs": -10.4}},
        )
        db.add(analysis)
        db.commit()
        return analysis.id


def set_status(analysis_id, status):
    with SessionLocal() as db:
        db.execute(update(Analysis).where(Analysis.id == analysis_id).values(status=status))
        db.commit()


def error_code(response):
    return response.json()["error"]["code"]


# --- rate limits -------------------------------------------------------------------------------


def test_rate_limits_do_nothing_while_switched_off(client, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_register", "1/hour")  # enabled stays false
    for i in range(3):
        r = client.post("/auth/register", json={"email": f"u{i}@example.com", "password": PASSWORD})
        assert r.status_code == 201


def test_registration_is_limited_per_ip(client, limits_on, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_register", "2/hour")
    for i in range(2):
        r = client.post("/auth/register", json={"email": f"u{i}@example.com", "password": PASSWORD})
        assert r.status_code == 201

    r = client.post("/auth/register", json={"email": "u3@example.com", "password": PASSWORD})
    assert r.status_code == 429
    assert error_code(r) == "rate_limited"
    assert int(r.headers["retry-after"]) >= 1


def test_invalid_registrations_do_not_use_up_the_limit(client, limits_on, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_register", "1/hour")
    for _ in range(3):  # rejected by validation before the route runs
        assert client.post("/auth/register", json={"email": "nope"}).status_code == 422
    ok = client.post("/auth/register", json={"email": "a@example.com", "password": PASSWORD})
    assert ok.status_code == 201


def test_login_attempts_are_limited_even_with_the_right_password(client, limits_on, monkeypatch):
    client.post("/auth/register", json={"email": "a@example.com", "password": PASSWORD})
    monkeypatch.setattr(settings, "rate_limit_login", "2/minute")

    wrong = {"username": "a@example.com", "password": "not the password"}
    assert client.post("/auth/login", data=wrong).status_code == 401
    assert client.post("/auth/login", data=wrong).status_code == 401

    right = {"username": "a@example.com", "password": PASSWORD}
    r = client.post("/auth/login", data=right)
    assert r.status_code == 429 and error_code(r) == "rate_limited"


def test_account_deletion_attempts_are_limited(client, limits_on, monkeypatch):
    headers = make_user(client, "a@example.com")
    monkeypatch.setattr(settings, "rate_limit_delete_account", "2/hour")

    for _ in range(2):
        r = client.request("DELETE", "/users/me", json={"password": "wrong"}, headers=headers)
        assert r.status_code == 403
    r = client.request("DELETE", "/users/me", json={"password": PASSWORD}, headers=headers)
    assert r.status_code == 429  # even the right password has to wait


def test_uploads_are_limited_per_user(client, limits_on, stub_analysis, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_upload", "2/hour")
    a = make_user(client, "a@example.com")
    b = make_user(client, "b@example.com")
    track_a = make_track(client, a)
    track_b = make_track(client, b)

    assert upload(client, a, track_a).status_code == 202
    assert upload(client, a, track_a).status_code == 202
    third = upload(client, a, track_a)
    assert third.status_code == 429 and error_code(third) == "rate_limited"

    assert upload(client, b, track_b).status_code == 202  # B has a budget of their own


def test_feedback_is_limited_per_user_and_only_real_attempts_count(
    client, limits_on, no_feedback_provider, monkeypatch
):
    monkeypatch.setattr(settings, "rate_limit_feedback", "2/hour")
    monkeypatch.setattr(settings, "rate_limit_feedback_global", "")
    a = make_user(client, "a@example.com")
    b = make_user(client, "b@example.com")
    analysis_a = add_done_analysis(make_track(client, a))
    analysis_b = add_done_analysis(make_track(client, b))

    # Unknown ids (404) and other people's analyses (404) do not cost anything.
    for _ in range(5):
        assert client.post("/analyses/9999/feedback", headers=a).status_code == 404
    assert client.post(f"/analyses/{analysis_b}/feedback", headers=a).status_code == 404

    # Two real attempts reach the provider (503: not configured). Failed attempts count too,
    # because a provider call may have been spent.
    for _ in range(2):
        r = client.post(f"/analyses/{analysis_a}/feedback", headers=a)
        assert r.status_code == 503 and error_code(r) == "not_configured"
    third = client.post(f"/analyses/{analysis_a}/feedback", headers=a)
    assert third.status_code == 429 and error_code(third) == "rate_limited"
    assert "retry-after" in third.headers

    # B is not affected by A's budget.
    assert client.post(f"/analyses/{analysis_b}/feedback", headers=b).status_code == 503


def test_feedback_has_one_budget_shared_by_all_users(
    client, limits_on, no_feedback_provider, monkeypatch
):
    monkeypatch.setattr(settings, "rate_limit_feedback", "10/hour")
    monkeypatch.setattr(settings, "rate_limit_feedback_global", "1/day")
    a = make_user(client, "a@example.com")
    b = make_user(client, "b@example.com")
    analysis_a = add_done_analysis(make_track(client, a))
    analysis_b = add_done_analysis(make_track(client, b))

    assert client.post(f"/analyses/{analysis_a}/feedback", headers=a).status_code == 503
    refused = client.post(f"/analyses/{analysis_b}/feedback", headers=b)
    assert refused.status_code == 429

    # The refusal did not use up B's own budget: once the shared cap is lifted B gets through.
    monkeypatch.setattr(settings, "rate_limit_feedback_global", "")
    assert client.post(f"/analyses/{analysis_b}/feedback", headers=b).status_code == 503


def test_feedback_errors_now_carry_their_own_codes(client, no_feedback_provider):
    headers = make_user(client, "a@example.com")
    analysis_id = add_done_analysis(make_track(client, headers))
    r = client.post(f"/analyses/{analysis_id}/feedback", headers=headers)
    assert r.status_code == 503
    assert r.json() == {
        "error": {"code": "not_configured", "message": "Feedback is not configured"}
    }


# --- quotas ------------------------------------------------------------------------------------


def test_track_quota(client, monkeypatch):
    monkeypatch.setattr(settings, "max_tracks_per_user", 2)
    a = make_user(client, "a@example.com")
    b = make_user(client, "b@example.com")
    make_track(client, a, "One")
    make_track(client, a, "Two")

    r = client.post("/tracks", json={"title": "Three"}, headers=a)
    assert r.status_code == 409 and error_code(r) == "quota_exceeded"

    assert client.post("/tracks", json={"title": "Mine"}, headers=b).status_code == 201


def test_versions_per_track_quota(client, stub_analysis, monkeypatch):
    monkeypatch.setattr(settings, "max_analyses_per_track", 2)
    headers = make_user(client, "a@example.com")
    track_id = make_track(client, headers)
    other_track = make_track(client, headers, "Other")

    assert upload(client, headers, track_id).status_code == 202
    assert upload(client, headers, track_id).status_code == 202
    r = upload(client, headers, track_id)
    assert r.status_code == 409 and error_code(r) == "quota_exceeded"

    assert upload(client, headers, other_track).status_code == 202  # the quota is per track


# --- capacity ----------------------------------------------------------------------------------


def test_a_user_can_only_have_so_many_analyses_running(client, stub_analysis, monkeypatch):
    monkeypatch.setattr(settings, "max_active_analyses_per_user", 1)
    headers = make_user(client, "a@example.com")
    track_id = make_track(client, headers)

    first = upload(client, headers, track_id)
    assert first.status_code == 202  # stays 'pending': the stub never runs the analysis

    second = upload(client, headers, track_id)
    assert second.status_code == 429
    assert error_code(second) == "too_many_active_analyses"
    assert "retry-after" in second.headers

    set_status(first.json()["id"], AnalysisStatus.DONE.value)
    assert upload(client, headers, track_id).status_code == 202


def test_the_server_refuses_new_uploads_when_it_is_busy(client, stub_analysis, monkeypatch):
    monkeypatch.setattr(settings, "max_active_analyses_global", 1)
    a = make_user(client, "a@example.com")
    b = make_user(client, "b@example.com")
    track_a = make_track(client, a)
    track_b = make_track(client, b)

    assert upload(client, a, track_a).status_code == 202
    busy = upload(client, b, track_b)
    assert busy.status_code == 503 and error_code(busy) == "server_busy"
    assert "retry-after" in busy.headers


def test_a_refused_upload_leaves_no_temp_file_and_no_row(client, stub_analysis, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "upload_tmp_dir", str(tmp_path))
    monkeypatch.setattr(settings, "max_analyses_per_track", 0)
    headers = make_user(client, "a@example.com")
    track_id = make_track(client, headers)

    assert upload(client, headers, track_id).status_code == 409

    assert list(tmp_path.iterdir()) == []  # checked before the file is ever written
    with SessionLocal() as db:
        assert db.query(Analysis).count() == 0


# --- concurrency slots -------------------------------------------------------------------------


def test_at_most_the_configured_number_of_analyses_run_at_once(monkeypatch):
    monkeypatch.setattr(analysis_runner, "_slots", threading.BoundedSemaphore(2))
    monkeypatch.setattr(analysis_runner, "_update", lambda *args, **kwargs: True)

    lock = threading.Lock()
    state = {"running": 0, "peak": 0, "finished": 0}

    def fake_analyze(path, context=None):
        with lock:
            state["running"] += 1
            state["peak"] = max(state["peak"], state["running"])
        time.sleep(0.05)
        with lock:
            state["running"] -= 1
            state["finished"] += 1
        return {}

    monkeypatch.setattr(analysis_runner, "analyze_file", fake_analyze)

    threads = [
        threading.Thread(
            target=analysis_runner.run_analysis, args=(i, "/no/such/file.wav", None, "mix.wav")
        )
        for i in range(6)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert state["finished"] == 6  # everyone gets their turn
    assert state["peak"] <= 2

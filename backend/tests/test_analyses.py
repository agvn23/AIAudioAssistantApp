import json
import os
from pathlib import Path

import pytest

pytest.importorskip("fastapi")

from analysis.errors import AnalysisError  # adjust if AnalysisError lives elsewhere
from conftest import make_sine, needs_ffmpeg

PASSWORD = "correct horse battery"
RUNNER = "app.services.analysis_runner.analyze_file"


# --- helpers ---------------------------------------------------------------------------------


def make_user(client, email):
    client.post("/auth/register", json={"email": email, "password": PASSWORD})
    r = client.post("/auth/login", data={"username": email, "password": PASSWORD})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def create_track(client, headers, **fields):
    r = client.post("/tracks", json={"title": "Midnight Drive"} | fields, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def upload(client, headers, track_id, filename="song.wav", content=b"RIFFfake", **form):
    return client.post(
        f"/tracks/{track_id}/analyses",
        headers=headers,
        files={"file": (filename, content, "application/octet-stream")},
        data=form,
    )


@pytest.fixture()
def alice(client):
    return make_user(client, "alice@example.com")


@pytest.fixture()
def bob(client):
    return make_user(client, "bob@example.com")


@pytest.fixture(autouse=True)
def upload_dir(tmp_path, monkeypatch):
    """Temp uploads go to a private folder, so tests can assert that nothing is left behind."""
    from app.config import settings

    folder = tmp_path / "uploads"
    folder.mkdir()
    monkeypatch.setattr(settings, "upload_tmp_dir", str(folder))
    return folder


@pytest.fixture()
def fake_engine(monkeypatch):
    """Replace the real analysis with a fast fake; `calls` records what it was given."""
    calls = []

    def fake(path, context=None, **kwargs):
        calls.append({"path": path, "context": context, "existed": os.path.exists(path)})
        return {
            "file": {"name": os.path.basename(path), "format": "wav"},
            "loudness": {"integrated_lufs": -14.0},
        }

    monkeypatch.setattr(RUNNER, fake)
    return calls


def failing_engine(monkeypatch, error):
    def fake(path, context=None, **kwargs):
        raise error

    monkeypatch.setattr(RUNNER, fake)


def leftovers(folder):
    return sorted(p.name for p in folder.iterdir())


# --- authentication --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method, path",
    [
        ("POST", "/tracks/1/analyses"),
        ("GET", "/tracks/1/analyses"),
        ("GET", "/analyses/1"),
        ("PATCH", "/analyses/1"),
        ("DELETE", "/analyses/1"),
    ],
)
def test_analysis_routes_require_a_token(client, method, path):
    assert client.request(method, path).status_code == 401
    bad = client.request(method, path, headers={"Authorization": "Bearer garbage"})
    assert bad.status_code == 401


# --- upload and background analysis ----------------------------------------------------------


def test_upload_returns_202_and_the_analysis_finishes(client, alice, fake_engine, upload_dir):
    track = create_track(client, alice, genre="House", target_platform="Spotify")
    r = upload(client, alice, track["id"], stage="mix", label="first mix")
    assert r.status_code == 202, r.text
    created = r.json()
    assert created["status"] == "pending"
    assert created["version_number"] == 1
    assert created["track_id"] == track["id"]
    assert created["stage"] == "mix" and created["label"] == "first mix"
    assert created["original_filename"] == "song.wav"

    # TestClient runs background tasks before returning, so the job has finished by now.
    done = client.get(f"/analyses/{created['id']}", headers=alice).json()
    assert done["status"] == "done"
    assert done["error_code"] is None
    assert done["metrics"]["loudness"]["integrated_lufs"] == -14.0
    assert done["metrics"]["file"]["name"] == "song.wav"  # not the random temp name
    assert done["feedback"] is None

    (call,) = fake_engine
    assert call["existed"] is True
    assert call["context"] == {"genre": "House", "target_platform": "Spotify", "stage": "mix"}
    assert leftovers(upload_dir) == []  # temp file deleted after analysis


def test_no_context_is_passed_when_nothing_is_known(client, alice, fake_engine):
    track = create_track(client, alice)
    upload(client, alice, track["id"])
    assert fake_engine[0]["context"] is None


def test_engine_errors_are_stored_as_failed_with_the_code(client, alice, monkeypatch, upload_dir):
    failing_engine(monkeypatch, AnalysisError("decode_failed", "ffmpeg could not decode"))
    track = create_track(client, alice)
    created = upload(client, alice, track["id"]).json()
    body = client.get(f"/analyses/{created['id']}", headers=alice).json()
    assert body["status"] == "failed"
    assert body["error_code"] == "decode_failed"
    assert body["metrics"] is None
    assert leftovers(upload_dir) == []


def test_unexpected_errors_never_leak_details(client, alice, monkeypatch, upload_dir):
    failing_engine(monkeypatch, RuntimeError("boom /secret/path"))
    track = create_track(client, alice)
    created = upload(client, alice, track["id"]).json()
    r = client.get(f"/analyses/{created['id']}", headers=alice)
    assert r.json()["status"] == "failed"
    assert r.json()["error_code"] == "internal_error"
    assert "boom" not in r.text and "Traceback" not in r.text
    assert leftovers(upload_dir) == []


def test_deleting_the_analysis_while_it_runs_is_harmless(
    client, alice, monkeypatch, upload_dir
):
    from app.db import SessionLocal
    from app.models import Analysis

    def fake(path, context=None, **kwargs):
        with SessionLocal() as db:  # the user deletes the version mid-run
            db.delete(db.query(Analysis).one())
            db.commit()
        return {"file": {"name": "x.wav"}}

    monkeypatch.setattr(RUNNER, fake)
    track = create_track(client, alice)
    assert upload(client, alice, track["id"]).status_code == 202  # no exception in the task
    assert client.get(f"/tracks/{track['id']}/analyses", headers=alice).json() == []
    assert leftovers(upload_dir) == []


# --- upload validation -----------------------------------------------------------------------


@pytest.mark.parametrize("filename", ["song.exe", "song", "song.wav.txt", "archive.zip"])
def test_unsupported_file_types_are_rejected(client, alice, fake_engine, upload_dir, filename):
    track = create_track(client, alice)
    assert upload(client, alice, track["id"], filename=filename).status_code == 415
    assert leftovers(upload_dir) == []
    assert client.get(f"/tracks/{track['id']}/analyses", headers=alice).json() == []


def test_extension_check_is_case_insensitive(client, alice, fake_engine):
    track = create_track(client, alice)
    assert upload(client, alice, track["id"], filename="SONG.WAV").status_code == 202


def test_files_over_the_size_limit_are_rejected(
    client, alice, fake_engine, upload_dir, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "max_upload_mb", 1)
    track = create_track(client, alice)
    too_big = b"\0" * (1024 * 1024 + 1)
    assert upload(client, alice, track["id"], content=too_big).status_code == 413
    assert upload(client, alice, track["id"], content=b"\0" * 1024 * 1024).status_code == 202
    assert leftovers(upload_dir) == []
    assert len(client.get(f"/tracks/{track['id']}/analyses", headers=alice).json()) == 1


def test_empty_files_are_rejected(client, alice, fake_engine, upload_dir):
    track = create_track(client, alice)
    assert upload(client, alice, track["id"], content=b"").status_code == 422
    assert leftovers(upload_dir) == []


def test_missing_file_and_bad_form_fields_are_422(client, alice, fake_engine):
    track = create_track(client, alice)
    url = f"/tracks/{track['id']}/analyses"
    assert client.post(url, headers=alice).status_code == 422
    assert upload(client, alice, track["id"], stage="mastered").status_code == 422
    assert upload(client, alice, track["id"], label="x" * 101).status_code == 422


def test_client_filename_is_never_used_as_a_path(client, alice, fake_engine, upload_dir, tmp_path):
    track = create_track(client, alice)
    r = upload(client, alice, track["id"], filename="../../evil/../name.wav")
    assert r.status_code == 202
    assert r.json()["original_filename"] == "name.wav"
    assert "evil" not in Path(fake_engine[0]["path"]).parts
    assert Path(fake_engine[0]["path"]).parent == upload_dir
    assert not (tmp_path / "name.wav").exists()


# --- versions and listing --------------------------------------------------------------------


def test_versions_increment_per_track(client, alice, fake_engine):
    one = create_track(client, alice, title="One")
    two = create_track(client, alice, title="Two")
    assert upload(client, alice, one["id"]).json()["version_number"] == 1
    assert upload(client, alice, one["id"]).json()["version_number"] == 2
    assert upload(client, alice, two["id"]).json()["version_number"] == 1
    assert upload(client, alice, one["id"]).json()["version_number"] == 3


def test_list_returns_summaries_in_version_order(client, alice, fake_engine):
    track = create_track(client, alice)
    for name in ("a.wav", "b.wav"):
        upload(client, alice, track["id"], filename=name)
    r = client.get(f"/tracks/{track['id']}/analyses", headers=alice)
    assert r.status_code == 200
    items = r.json()
    assert [i["original_filename"] for i in items] == ["a.wav", "b.wav"]
    assert [i["version_number"] for i in items] == [1, 2]
    assert all("metrics" not in i and "feedback" not in i for i in items)
    assert all(i["status"] == "done" for i in items)


# --- update and delete -----------------------------------------------------------------------


def test_patch_changes_label_and_stage_only(client, alice, fake_engine):
    track = create_track(client, alice)
    created = upload(client, alice, track["id"], label="old", stage="demo").json()
    url = f"/analyses/{created['id']}"

    r = client.patch(
        url,
        headers=alice,
        json={"label": "new", "stage": "master", "status": "failed", "metrics": {}, "track_id": 9},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["label"] == "new" and body["stage"] == "master"
    assert body["status"] == "done" and body["metrics"] != {} and body["track_id"] == track["id"]


def test_patch_can_clear_and_empty_body_changes_nothing(client, alice, fake_engine):
    track = create_track(client, alice)
    created = upload(client, alice, track["id"], label="old", stage="demo").json()
    url = f"/analyses/{created['id']}"

    same = client.patch(url, headers=alice, json={}).json()
    assert same["label"] == "old" and same["stage"] == "demo"

    cleared = client.patch(url, headers=alice, json={"label": "  ", "stage": None}).json()
    assert cleared["label"] is None and cleared["stage"] is None


def test_patch_validates_stage(client, alice, fake_engine):
    track = create_track(client, alice)
    created = upload(client, alice, track["id"]).json()
    r = client.patch(f"/analyses/{created['id']}", headers=alice, json={"stage": "final"})
    assert r.status_code == 422


def test_delete_one_version(client, alice, fake_engine):
    track = create_track(client, alice)
    first = upload(client, alice, track["id"]).json()
    upload(client, alice, track["id"])
    assert client.delete(f"/analyses/{first['id']}", headers=alice).status_code == 204
    assert client.get(f"/analyses/{first['id']}", headers=alice).status_code == 404
    assert client.delete(f"/analyses/{first['id']}", headers=alice).status_code == 404
    left = client.get(f"/tracks/{track['id']}/analyses", headers=alice).json()
    assert [i["version_number"] for i in left] == [2]


def test_next_version_number_after_a_delete_does_not_reuse_a_live_number(
    client, alice, fake_engine
):
    track = create_track(client, alice)
    upload(client, alice, track["id"])
    second = upload(client, alice, track["id"]).json()
    client.delete(f"/analyses/{second['id']}", headers=alice)
    assert upload(client, alice, track["id"]).json()["version_number"] == 2  # max + 1


def test_deleting_a_track_deletes_its_analyses(client, alice, fake_engine):
    from sqlalchemy import func, select

    from app.db import SessionLocal
    from app.models import Analysis

    track = create_track(client, alice)
    upload(client, alice, track["id"])
    upload(client, alice, track["id"])
    client.delete(f"/tracks/{track['id']}", headers=alice)
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Analysis)) == 0


def test_deleting_a_user_deletes_their_analyses(client, alice, bob, fake_engine):
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Analysis, User

    mine = create_track(client, alice)
    theirs = create_track(client, bob)
    upload(client, alice, mine["id"])
    upload(client, bob, theirs["id"])
    alice_id = client.get("/users/me", headers=alice).json()["id"]

    with SessionLocal() as db:
        db.delete(db.get(User, alice_id))
        db.commit()
        remaining = db.scalars(select(Analysis.track_id)).all()
    assert remaining == [theirs["id"]]


# --- ownership: another user's data returns 404 ------------------------------------------------


@pytest.mark.parametrize(
    "method, body", [("GET", None), ("PATCH", {"label": "mine now"}), ("DELETE", None)]
)
def test_another_users_analysis_returns_404_exactly_like_a_missing_one(
    client, alice, bob, fake_engine, method, body
):
    track = create_track(client, alice)
    created = upload(client, alice, track["id"], label="mine").json()
    other = client.request(method, f"/analyses/{created['id']}", headers=bob, json=body)
    missing = client.request(method, "/analyses/99999", headers=bob, json=body)
    assert other.status_code == missing.status_code == 404
    assert other.json() == missing.json()
    assert client.get(f"/analyses/{created['id']}", headers=alice).json()["label"] == "mine"


def test_track_scoped_analysis_routes_hide_other_users_tracks(
    client, alice, bob, fake_engine, upload_dir
):
    track = create_track(client, alice)
    upload(client, alice, track["id"])

    listing = client.get(f"/tracks/{track['id']}/analyses", headers=bob)
    missing_listing = client.get("/tracks/99999/analyses", headers=bob)
    assert listing.status_code == missing_listing.status_code == 404
    assert listing.json() == missing_listing.json()

    before = len(fake_engine)
    attempt = upload(client, bob, track["id"])
    missing_upload = upload(client, bob, 99999)
    assert attempt.status_code == missing_upload.status_code == 404
    assert attempt.json() == missing_upload.json()
    assert len(fake_engine) == before  # nothing was analysed
    assert leftovers(upload_dir) == []
    assert len(client.get(f"/tracks/{track['id']}/analyses", headers=alice).json()) == 1


# --- startup cleanup -------------------------------------------------------------------------


def test_analyses_left_unfinished_by_a_previous_run_are_marked_failed(client, alice, fake_engine):
    from app.db import SessionLocal
    from app.models import Analysis
    from app.services.analysis_runner import mark_interrupted

    track = create_track(client, alice)
    with SessionLocal() as db:
        for number, status in enumerate(["pending", "running", "done", "failed"], start=1):
            db.add(
                Analysis(
                    track_id=track["id"],
                    version_number=number,
                    original_filename=f"{status}.wav",
                    status=status,
                )
            )
        db.commit()

    assert mark_interrupted() == 2
    items = client.get(f"/tracks/{track['id']}/analyses", headers=alice).json()
    assert [(i["status"], i["error_code"]) for i in items] == [
        ("failed", "interrupted"),
        ("failed", "interrupted"),
        ("done", None),
        ("failed", None),
    ]


# --- end to end with the real engine ---------------------------------------------------------


@needs_ffmpeg
def test_real_upload_produces_metrics_that_match_the_schema(client, alice, tmp_path, upload_dir):
    pytest.importorskip("essentia")
    jsonschema = pytest.importorskip("jsonschema")

    tone = tmp_path / "tone.wav"
    make_sine(tone, seconds=12, channels=2)
    track = create_track(client, alice, genre="house")
    created = upload(
        client, alice, track["id"], filename="tone.wav", content=tone.read_bytes(), stage="demo"
    ).json()

    body = client.get(f"/analyses/{created['id']}", headers=alice).json()
    assert body["status"] == "done", body
    schema_path = Path(__file__).resolve().parents[2] / "schema" / "metrics.schema.json"
    jsonschema.validate(body["metrics"], json.loads(schema_path.read_text()))
    assert body["metrics"]["file"]["name"] == "tone.wav"
    assert body["metrics"]["context"] == {"genre": "house", "stage": "demo"}
    assert leftovers(upload_dir) == []

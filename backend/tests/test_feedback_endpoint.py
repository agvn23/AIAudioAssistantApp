import pytest

pytest.importorskip("fastapi")

from feedback_fakes import FakeGenerator, example_metrics, good_item, good_output

from app.services.feedback.errors import FeedbackError

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


def upload(client, headers, track_id, **form):
    return client.post(
        f"/tracks/{track_id}/analyses",
        headers=headers,
        files={"file": ("song.wav", b"RIFFfake", "application/octet-stream")},
        data=form,
    )


def analysed(client, headers, stage="demo"):
    """A track (pop rock / spotify) with one finished analysis; returns (track, analysis_id)."""
    track = create_track(client, headers, genre="pop rock", target_platform="spotify")
    created = upload(client, headers, track["id"], stage=stage).json()
    return track, created["id"]


def ask(client, headers, analysis_id):
    return client.post(f"/analyses/{analysis_id}/feedback", headers=headers)


def fetch(client, headers, analysis_id):
    return client.get(f"/analyses/{analysis_id}", headers=headers).json()


@pytest.fixture()
def alice(client):
    return make_user(client, "alice@example.com")


@pytest.fixture()
def bob(client):
    return make_user(client, "bob@example.com")


@pytest.fixture(autouse=True)
def upload_dir(tmp_path, monkeypatch):
    from app.config import settings

    folder = tmp_path / "uploads"
    folder.mkdir()
    monkeypatch.setattr(settings, "upload_tmp_dir", str(folder))
    return folder


@pytest.fixture()
def example_engine(monkeypatch):
    """The analysis engine returns realistic metrics (the example track)."""

    def fake(path, context=None, **kwargs):
        return example_metrics()

    monkeypatch.setattr(RUNNER, fake)


@pytest.fixture()
def use_generator(client):
    """Install a fake feedback generator for the duration of a test."""
    from app.deps import get_feedback_generator_factory
    from app.main import app

    def install(generator):
        app.dependency_overrides[get_feedback_generator_factory] = lambda: (lambda: generator)

    yield install
    app.dependency_overrides.pop(get_feedback_generator_factory, None)


@pytest.fixture()
def unconfigured(monkeypatch):
    """No provider configured, whatever is in the developer's own .env file."""
    from app.config import settings

    monkeypatch.setattr(settings, "feedback_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", None)
    monkeypatch.setattr(settings, "gemini_model", None)


# --- authentication and ownership ------------------------------------------------------------


def test_feedback_route_requires_a_token(client):
    assert client.post("/analyses/1/feedback").status_code == 401
    bad = client.post("/analyses/1/feedback", headers={"Authorization": "Bearer garbage"})
    assert bad.status_code == 401


def test_another_users_analysis_returns_404_like_a_missing_one(
    client, alice, bob, example_engine, use_generator
):
    generator = FakeGenerator(good_output())
    use_generator(generator)
    _, analysis_id = analysed(client, alice)

    other = ask(client, bob, analysis_id)
    missing = ask(client, bob, 99999)
    assert other.status_code == missing.status_code == 404
    assert other.json() == missing.json()
    assert generator.calls == []  # nothing was sent to the model
    assert fetch(client, alice, analysis_id)["feedback"] is None


def test_ownership_is_checked_before_the_provider_configuration(
    client, alice, bob, example_engine, unconfigured
):
    _, analysis_id = analysed(client, alice)
    assert ask(client, bob, analysis_id).status_code == 404  # not 503


# --- success ---------------------------------------------------------------------------------


def test_feedback_is_generated_and_stored(client, alice, example_engine, use_generator):
    _, analysis_id = analysed(client, alice)
    before = fetch(client, alice, analysis_id)
    assert before["feedback"] is None

    generator = FakeGenerator(good_output(summary="Loud demo."))
    use_generator(generator)
    r = ask(client, alice, analysis_id)

    assert r.status_code == 200, r.text
    feedback = r.json()["feedback"]
    assert feedback["summary"] == "Loud demo."
    assert feedback["meta"]["model"] == "fake-model"
    assert feedback["items"][0]["evidence"][0]["metric"] == "loudness.true_peak_dbtp"
    assert len(generator.calls) == 1

    after = fetch(client, alice, analysis_id)
    assert after["feedback"] == feedback
    for field in ("status", "metrics", "stage", "label", "error_code", "version_number"):
        assert after[field] == before[field]  # the analysis itself is untouched


def test_context_comes_from_the_current_track_and_analysis_row(
    client, alice, example_engine, use_generator
):
    track, analysis_id = analysed(client, alice, stage="demo")
    # Edited after the analysis ran; the stored metrics.context still says demo / pop rock.
    client.patch(f"/analyses/{analysis_id}", headers=alice, json={"stage": "master"})
    client.patch(f"/tracks/{track['id']}", headers=alice, json={"genre": "techno"})

    generator = FakeGenerator(good_output())
    use_generator(generator)
    body = ask(client, alice, analysis_id).json()

    message = generator.calls[0]["user_message"]
    assert '"stage": "master"' in message
    assert '"genre": "techno"' in message
    assert "pop rock" not in message
    assert "song.wav" not in message  # the file name never reaches the model
    assert body["feedback"]["meta"]["context_used"] == {
        "genre": "techno",
        "target_platform": "spotify",
        "stage": "master",
    }


def test_regenerating_replaces_the_previous_feedback(client, alice, example_engine, use_generator):
    _, analysis_id = analysed(client, alice)

    use_generator(FakeGenerator(good_output(summary="First take.")))
    assert ask(client, alice, analysis_id).json()["feedback"]["summary"] == "First take."

    use_generator(FakeGenerator(good_output(summary="Second take.")))
    assert ask(client, alice, analysis_id).json()["feedback"]["summary"] == "Second take."
    assert fetch(client, alice, analysis_id)["feedback"]["summary"] == "Second take."


# --- preconditions ---------------------------------------------------------------------------


@pytest.mark.parametrize("status", ["pending", "running", "failed", "done"])
def test_feedback_needs_a_finished_analysis_with_metrics(client, alice, use_generator, status):
    from app.db import SessionLocal
    from app.models import Analysis

    generator = FakeGenerator(good_output())
    use_generator(generator)
    track = create_track(client, alice)
    with SessionLocal() as db:  # "done" here has no metrics, which counts as unfinished too
        row = Analysis(
            track_id=track["id"], version_number=1, original_filename="x.wav", status=status
        )
        db.add(row)
        db.commit()
        analysis_id = row.id

    assert ask(client, alice, analysis_id).status_code == 409
    assert generator.calls == []


# --- failures never touch the analysis -------------------------------------------------------


def test_unconfigured_provider_returns_503_and_changes_nothing(
    client, alice, example_engine, unconfigured
):
    _, analysis_id = analysed(client, alice)
    before = fetch(client, alice, analysis_id)

    r = ask(client, alice, analysis_id)
    assert r.status_code == 503
    assert "not configured" in r.json()["error"]["message"].lower()
    assert fetch(client, alice, analysis_id) == before


@pytest.mark.parametrize(
    ("code", "status"),
    [("timeout", 504), ("provider_error", 502), ("invalid_output", 502), ("not_configured", 503)],
)
def test_provider_failures_map_to_http_errors_and_keep_the_old_feedback(
    client, alice, example_engine, use_generator, code, status
):
    _, analysis_id = analysed(client, alice)
    use_generator(FakeGenerator(good_output(summary="Keep me.")))
    ask(client, alice, analysis_id)
    before = fetch(client, alice, analysis_id)

    use_generator(FakeGenerator(FeedbackError(code, "A safe message.")))
    r = ask(client, alice, analysis_id)
    assert r.status_code == status
    assert r.json()["error"]["message"] == "A safe message."

    after = fetch(client, alice, analysis_id)
    assert after == before
    assert after["status"] == "done" and after["feedback"]["summary"] == "Keep me."


def test_unusable_model_output_returns_502_after_the_retry(
    client, alice, example_engine, use_generator
):
    _, analysis_id = analysed(client, alice)
    generator = FakeGenerator("garbage", "more garbage")
    use_generator(generator)

    r = ask(client, alice, analysis_id)
    assert r.status_code == 502
    assert len(generator.calls) == 2
    assert fetch(client, alice, analysis_id)["feedback"] is None


def test_wrong_evidence_numbers_are_never_stored(client, alice, example_engine, use_generator):
    _, analysis_id = analysed(client, alice)
    invented = good_item(evidence=[{"metric": "loudness.true_peak_dbtp", "value": -3.0}])
    use_generator(FakeGenerator(good_output([invented]), good_output([invented])))

    assert ask(client, alice, analysis_id).status_code == 502
    assert fetch(client, alice, analysis_id)["feedback"] is None


class DeletingGenerator(FakeGenerator):
    """Deletes the analysis while the 'model' is thinking."""

    def generate(self, **kwargs):
        from app.db import SessionLocal
        from app.models import Analysis

        with SessionLocal() as db:
            db.delete(db.query(Analysis).one())
            db.commit()
        return super().generate(**kwargs)


def test_deleting_the_analysis_while_the_model_runs_gives_404(
    client, alice, example_engine, use_generator
):
    _, analysis_id = analysed(client, alice)
    use_generator(DeletingGenerator(good_output()))

    assert ask(client, alice, analysis_id).status_code == 404
    assert client.get(f"/analyses/{analysis_id}", headers=alice).status_code == 404
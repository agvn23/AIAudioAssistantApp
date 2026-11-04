from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Analysis, Tag, Track, User, track_tags

PASSWORD = "correct horse battery"


def register(client, email):
    return client.post("/auth/register", json={"email": email, "password": PASSWORD})


def login(client, email, password=PASSWORD):
    return client.post("/auth/login", data={"username": email, "password": password})


def headers_for(client, email):
    token = login(client, email).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def delete_account(client, headers, password=PASSWORD):
    # httpx's client.delete() takes no body, so use request().
    return client.request("DELETE", "/users/me", json={"password": password}, headers=headers)


def make_user(client, email):
    register(client, email)
    return headers_for(client, email)


def make_track(client, headers, title, tags):
    r = client.post("/tracks", json={"title": title, "tags": tags}, headers=headers)
    assert r.status_code == 201
    return r.json()["id"]


def add_analysis(track_id, status="done"):
    with SessionLocal() as db:
        analysis = Analysis(
            track_id=track_id,
            version_number=1,
            original_filename="mix.wav",
            status=status,
            metrics={"loudness": {"integrated_lufs": -10.4}} if status == "done" else None,
        )
        db.add(analysis)
        db.commit()
        return analysis.id


def count(source):
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(source))


# --- the endpoint ------------------------------------------------------------------------------


def test_delete_requires_authentication(client):
    r = client.request("DELETE", "/users/me", json={"password": PASSWORD})
    assert r.status_code == 401


def test_delete_requires_the_password_in_the_body(client):
    headers = make_user(client, "a@example.com")
    assert client.request("DELETE", "/users/me", headers=headers).status_code == 422
    assert client.request("DELETE", "/users/me", json={}, headers=headers).status_code == 422
    assert client.request("DELETE", "/users/me", json={"password": ""}, headers=headers).status_code == 422
    assert count(User) == 1


def test_wrong_password_deletes_nothing(client):
    headers = make_user(client, "a@example.com")
    make_track(client, headers, "Song", ["club"])

    r = delete_account(client, headers, password="not the password")

    assert r.status_code == 403
    assert r.json() == {"error": {"code": "invalid_password", "message": "Incorrect password"}}
    assert count(User) == 1 and count(Track) == 1
    assert login(client, "a@example.com").status_code == 200


def test_successful_delete_returns_204_and_ends_the_session(client):
    headers = make_user(client, "a@example.com")

    r = delete_account(client, headers)

    assert r.status_code == 204
    assert r.content == b""
    assert client.get("/users/me", headers=headers).status_code == 401  # the token still exists
    assert login(client, "a@example.com").status_code == 401
    assert register(client, "a@example.com").status_code == 201  # the email is free again


# --- everything cascades, and only the right rows go -------------------------------------------


def test_deleting_an_account_removes_everything_it_owns_and_nothing_else(client):
    a = make_user(client, "a@example.com")
    b = make_user(client, "b@example.com")
    a1 = make_track(client, a, "A1", ["club", "demo"])
    a2 = make_track(client, a, "A2", ["club"])
    b1 = make_track(client, b, "B1", ["club"])  # same tag name, but B's own tag
    add_analysis(a1)
    add_analysis(a2)
    add_analysis(b1)

    # Before: 2 users, 3 tracks, tags club+demo (A) and club (B), 4 links, 3 analyses.
    assert (count(User), count(Track), count(Tag), count(track_tags), count(Analysis)) == (
        2, 3, 3, 4, 3,
    )

    assert delete_account(client, a).status_code == 204

    assert (count(User), count(Track), count(Tag), count(track_tags), count(Analysis)) == (
        1, 1, 1, 1, 1,
    )
    listing = client.get("/tracks", headers=b).json()
    assert listing["total"] == 1
    assert listing["items"][0]["title"] == "B1" and listing["items"][0]["tags"] == ["club"]
    assert client.get(f"/tracks/{a1}", headers=b).status_code == 404


# --- token reuse -------------------------------------------------------------------------------


def test_a_deleted_users_token_never_works_for_the_next_account(client):
    """Without AUTOINCREMENT, SQLite gives the next registration the deleted user's id, and the
    old (still unexpired) token would authenticate as the new user."""
    old_headers = make_user(client, "a@example.com")
    assert delete_account(client, old_headers).status_code == 204

    new_id = register(client, "b@example.com").json()["id"]
    assert new_id != 1

    assert client.get("/users/me", headers=old_headers).status_code == 401


# --- background work for a deleted account -----------------------------------------------------


def test_an_analysis_that_finishes_after_the_user_was_deleted_is_harmless(
    client, tmp_path, monkeypatch
):
    from app.services import analysis_runner

    headers = make_user(client, "a@example.com")
    track_id = make_track(client, headers, "Song", [])
    analysis_id = add_analysis(track_id, status="pending")
    temp_file = tmp_path / "upload_x.wav"
    temp_file.write_bytes(b"not really audio")

    def analyze_then_the_user_deletes_the_account(path, context=None):
        assert delete_account(client, headers).status_code == 204
        return {"loudness": {"integrated_lufs": -10.4}}

    monkeypatch.setattr(analysis_runner, "analyze_file", analyze_then_the_user_deletes_the_account)

    analysis_runner.run_analysis(analysis_id, str(temp_file), None, "mix.wav")  # must not raise

    assert count(Analysis) == 0
    assert not temp_file.exists()  # the temp file is deleted even though the row is gone


def test_a_queued_analysis_of_a_deleted_user_still_cleans_up_its_temp_file(client, tmp_path):
    from app.services import analysis_runner

    headers = make_user(client, "a@example.com")
    track_id = make_track(client, headers, "Song", [])
    analysis_id = add_analysis(track_id, status="pending")
    temp_file = tmp_path / "upload_y.wav"
    temp_file.write_bytes(b"not really audio")
    assert delete_account(client, headers).status_code == 204

    analysis_runner.run_analysis(analysis_id, str(temp_file), None, "mix.wav")

    assert not temp_file.exists()

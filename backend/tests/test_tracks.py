from datetime import datetime

import pytest

pytest.importorskip("fastapi")

PASSWORD = "correct horse battery"


def make_user(client, email):
    """Register + log in; returns the Authorization header."""
    client.post("/auth/register", json={"email": email, "password": PASSWORD})
    r = client.post("/auth/login", data={"username": email, "password": PASSWORD})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def create_track(client, headers, **fields):
    payload = {"title": "Midnight Drive"} | fields
    r = client.post("/tracks", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def titles(response):
    assert response.status_code == 200, response.text
    return [item["title"] for item in response.json()["items"]]


def tag_rows():
    """(user_id, name) for every tag row in the database, regardless of owner."""
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Tag

    with SessionLocal() as db:
        return sorted(db.execute(select(Tag.user_id, Tag.name)).all())


@pytest.fixture()
def alice(client):
    return make_user(client, "alice@example.com")


@pytest.fixture()
def bob(client):
    return make_user(client, "bob@example.com")


# --- authentication -------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method, path",
    [
        ("POST", "/tracks"),
        ("GET", "/tracks"),
        ("GET", "/tracks/1"),
        ("PATCH", "/tracks/1"),
        ("DELETE", "/tracks/1"),
    ],
)
def test_track_routes_require_a_token(client, method, path):
    assert client.request(method, path).status_code == 401
    bad = client.request(method, path, headers={"Authorization": "Bearer garbage"})
    assert bad.status_code == 401


# --- create ---------------------------------------------------------------------------------


def test_create_track_returns_the_track_with_normalized_tags(client, alice):
    r = client.post(
        "/tracks",
        headers=alice,
        json={
            "title": "  Midnight Drive ",
            "genre": "House",
            "target_platform": "Spotify",
            "notes": "Needs a wider chorus",
            "tags": ["  Club ", "wip", "CLUB", "late   night"],
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "Midnight Drive"
    assert body["genre"] == "House"
    assert body["target_platform"] == "Spotify"
    assert body["notes"] == "Needs a wider chorus"
    assert body["tags"] == ["club", "late night", "wip"]  # lower-cased, de-duplicated, sorted
    assert body["id"] >= 1
    assert body["created_at"] and body["updated_at"]
    assert "user_id" not in body


def test_create_track_needs_only_a_title(client, alice):
    body = create_track(client, alice)
    assert body["genre"] is None and body["target_platform"] is None and body["notes"] is None
    assert body["tags"] == []


def test_blank_optional_fields_are_stored_as_null(client, alice):
    body = create_track(client, alice, genre="   ", notes="", target_platform=" ")
    assert body["genre"] is None and body["notes"] is None and body["target_platform"] is None


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 201},
        {"title": "t", "genre": "x" * 101},
        {"title": "t", "notes": "x" * 5001},
        {"title": "t", "tags": ["  "]},
        {"title": "t", "tags": ["x" * 31]},
        {"title": "t", "tags": [f"tag{i}" for i in range(11)]},
        {"title": "t", "tags": "club"},
        {"title": "t", "tags": [1, 2]},
    ],
)
def test_create_track_validates_input(client, alice, payload):
    assert client.post("/tracks", json=payload, headers=alice).status_code == 422


def test_ten_tags_is_the_limit_and_is_allowed(client, alice):
    body = create_track(client, alice, tags=[f"tag{i}" for i in range(10)])
    assert len(body["tags"]) == 10


def test_client_cannot_choose_the_owner(client, alice, bob):
    me_bob = client.get("/users/me", headers=bob).json()
    track = create_track(client, alice, user_id=me_bob["id"])
    assert client.get(f"/tracks/{track['id']}", headers=alice).status_code == 200
    assert client.get(f"/tracks/{track['id']}", headers=bob).status_code == 404


# --- read and list ---------------------------------------------------------------------------


def test_get_own_track(client, alice):
    track = create_track(client, alice, genre="House", tags=["wip"])
    r = client.get(f"/tracks/{track['id']}", headers=alice)
    assert r.status_code == 200
    assert r.json() == track


def test_list_is_newest_first_and_paged(client, alice):
    for i in range(5):
        create_track(client, alice, title=f"T{i}")

    first = client.get("/tracks", headers=alice, params={"limit": 2})
    assert titles(first) == ["T4", "T3"]
    assert first.json()["total"] == 5
    assert first.json()["limit"] == 2 and first.json()["offset"] == 0

    assert titles(client.get("/tracks", headers=alice, params={"limit": 2, "offset": 2})) == [
        "T2",
        "T1",
    ]
    assert titles(client.get("/tracks", headers=alice, params={"limit": 2, "offset": 4})) == ["T0"]
    assert titles(client.get("/tracks", headers=alice, params={"offset": 50})) == []


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 101}, {"offset": -1}])
def test_list_validates_paging(client, alice, params):
    assert client.get("/tracks", headers=alice, params=params).status_code == 422


def test_list_filters(client, alice):
    create_track(
        client, alice, title="Midnight Drive", genre="House", notes="100% sidechain",
        tags=["Club", "wip"],
    )  # fmt: skip
    create_track(client, alice, title="Sunrise", genre="ambient", notes="pads", tags=["wip"])
    create_track(client, alice, title="Rainy Day")

    def ask(**params):
        return titles(client.get("/tracks", headers=alice, params=params))

    assert set(ask()) == {"Midnight Drive", "Sunrise", "Rainy Day"}
    assert ask(q="MIDNIGHT") == ["Midnight Drive"]  # case-insensitive, matches the title
    assert ask(q="pads") == ["Sunrise"]  # matches the notes
    assert ask(q="%") == ["Midnight Drive"]  # wildcards are literal characters
    assert ask(genre="HOUSE") == ["Midnight Drive"]
    assert set(ask(tag="WIP")) == {"Midnight Drive", "Sunrise"}  # tag filter is normalized too
    assert ask(tag="club", q="sun") == []  # filters combine with AND
    assert ask(tag="nope") == []

    none = client.get("/tracks", headers=alice, params={"tag": "nope"}).json()
    assert none["total"] == 0 and none["items"] == []


def test_total_counts_the_filtered_set_not_just_the_page(client, alice):
    for i in range(3):
        create_track(client, alice, title=f"House {i}", genre="house")
    create_track(client, alice, title="Other", genre="techno")
    body = client.get("/tracks", headers=alice, params={"genre": "house", "limit": 2}).json()
    assert body["total"] == 3 and len(body["items"]) == 2


# --- update ----------------------------------------------------------------------------------


def test_patch_changes_only_the_fields_sent(client, alice):
    track = create_track(client, alice, genre="House", notes="v1", tags=["wip"])
    r = client.patch(f"/tracks/{track['id']}", headers=alice, json={"notes": "v2"})
    assert r.status_code == 200
    body = r.json()
    assert body["notes"] == "v2"
    assert body["title"] == track["title"]
    assert body["genre"] == "House"
    assert body["tags"] == ["wip"]


def test_patch_can_clear_optional_fields_with_null(client, alice):
    track = create_track(client, alice, genre="House", target_platform="Spotify", notes="x")
    r = client.patch(
        f"/tracks/{track['id']}",
        headers=alice,
        json={"genre": None, "target_platform": None, "notes": None},
    )
    body = r.json()
    assert body["genre"] is None and body["target_platform"] is None and body["notes"] is None


@pytest.mark.parametrize("payload", [{"title": None}, {"title": " "}, {"tags": None}])
def test_patch_rejects_null_or_blank_title_and_null_tags(client, alice, payload):
    track = create_track(client, alice, tags=["wip"])
    assert client.patch(f"/tracks/{track['id']}", headers=alice, json=payload).status_code == 422
    assert client.get(f"/tracks/{track['id']}", headers=alice).json() == track


def test_patch_with_an_empty_body_changes_nothing(client, alice):
    track = create_track(client, alice, tags=["wip"])
    r = client.patch(f"/tracks/{track['id']}", headers=alice, json={})
    assert r.status_code == 200 and r.json() == track


def test_patch_replaces_the_tag_set(client, alice):
    track = create_track(client, alice, tags=["wip", "club"])
    url = f"/tracks/{track['id']}"
    assert client.patch(url, headers=alice, json={"tags": ["Mastered", "club"]}).json()[
        "tags"
    ] == ["club", "mastered"]
    assert client.patch(url, headers=alice, json={"tags": []}).json()["tags"] == []
    assert client.get(url, headers=alice).json()["tags"] == []


def test_patch_moves_updated_at_forward(client, alice):
    track = create_track(client, alice)
    url = f"/tracks/{track['id']}"
    before = datetime.fromisoformat(client.get(url, headers=alice).json()["updated_at"])
    client.patch(url, headers=alice, json={"tags": ["wip"]})  # a tags-only change counts
    after = datetime.fromisoformat(client.get(url, headers=alice).json()["updated_at"])
    assert after > before


def test_patch_cannot_change_the_owner_or_id(client, alice, bob):
    track = create_track(client, alice)
    me_bob = client.get("/users/me", headers=bob).json()
    client.patch(
        f"/tracks/{track['id']}", headers=alice, json={"user_id": me_bob["id"], "id": 999}
    )
    assert client.get(f"/tracks/{track['id']}", headers=alice).status_code == 200
    assert client.get(f"/tracks/{track['id']}", headers=bob).status_code == 404


# --- delete and tag lifecycle ----------------------------------------------------------------


def test_delete_track(client, alice):
    track = create_track(client, alice)
    url = f"/tracks/{track['id']}"
    assert client.delete(url, headers=alice).status_code == 204
    assert client.get(url, headers=alice).status_code == 404
    assert client.delete(url, headers=alice).status_code == 404
    assert titles(client.get("/tracks", headers=alice)) == []


def test_unused_tags_are_removed_but_shared_tags_stay(client, alice):
    one = create_track(client, alice, title="One", tags=["shared", "only-one"])
    two = create_track(client, alice, title="Two", tags=["shared"])
    user_id = client.get("/users/me", headers=alice).json()["id"]
    assert tag_rows() == [(user_id, "only-one"), (user_id, "shared")]

    client.patch(f"/tracks/{one['id']}", headers=alice, json={"tags": ["shared"]})
    assert tag_rows() == [(user_id, "shared")]  # "only-one" had no track left

    client.delete(f"/tracks/{one['id']}", headers=alice)
    assert tag_rows() == [(user_id, "shared")]  # still used by track two

    client.delete(f"/tracks/{two['id']}", headers=alice)
    assert tag_rows() == []


def test_two_tracks_of_one_user_share_a_single_tag_row(client, alice):
    create_track(client, alice, title="One", tags=["wip"])
    create_track(client, alice, title="Two", tags=["WIP"])
    assert len(tag_rows()) == 1


def test_deleting_a_user_removes_their_tracks_tags_and_links(client, alice, bob):
    from sqlalchemy import func, select

    from app.db import SessionLocal
    from app.models import Track, User, track_tags

    create_track(client, alice, title="Alice 1", tags=["wip", "club"])
    create_track(client, alice, title="Alice 2", tags=["wip"])
    create_track(client, bob, title="Bob 1", tags=["wip"])
    alice_id = client.get("/users/me", headers=alice).json()["id"]
    bob_id = client.get("/users/me", headers=bob).json()["id"]

    with SessionLocal() as db:
        db.delete(db.get(User, alice_id))
        db.commit()
        left = db.scalars(select(Track.title)).all()
        links = db.scalar(select(func.count()).select_from(track_tags))

    assert left == ["Bob 1"]
    assert links == 1  # only Bob's link remains
    assert tag_rows() == [(bob_id, "wip")]


# --- ownership: another user's data returns 404 ------------------------------------------------


@pytest.mark.parametrize(
    "method, body",
    [("GET", None), ("PATCH", {"title": "Hijacked"}), ("DELETE", None)],
)
def test_another_users_track_returns_404_exactly_like_a_missing_one(
    client, alice, bob, method, body
):
    track = create_track(client, alice, title="Mine", tags=["wip"])
    other = client.request(method, f"/tracks/{track['id']}", headers=bob, json=body)
    missing = client.request(method, "/tracks/99999", headers=bob, json=body)
    assert other.status_code == missing.status_code == 404
    assert other.json() == missing.json()  # nothing in the response reveals that the id exists

    # ...and nothing happened to the owner's track
    assert client.get(f"/tracks/{track['id']}", headers=alice).json() == track


def test_lists_and_filters_never_include_another_users_tracks(client, alice, bob):
    create_track(client, alice, title="Alice track", genre="house", notes="secret", tags=["wip"])
    create_track(client, bob, title="Bob track", genre="house", tags=["wip"])

    assert titles(client.get("/tracks", headers=alice)) == ["Alice track"]
    assert titles(client.get("/tracks", headers=bob)) == ["Bob track"]
    for params in ({"q": "secret"}, {"genre": "house"}, {"tag": "wip"}):
        assert "Alice track" not in titles(client.get("/tracks", headers=bob, params=params))
    assert client.get("/tracks", headers=bob, params={"q": "secret"}).json()["total"] == 0


def test_tags_are_private_to_each_user(client, alice, bob):
    create_track(client, alice, tags=["wip"])
    create_track(client, bob, tags=["wip"])  # the same name is fine: unique per user, not global
    alice_id = client.get("/users/me", headers=alice).json()["id"]
    bob_id = client.get("/users/me", headers=bob).json()["id"]
    assert tag_rows() == sorted([(alice_id, "wip"), (bob_id, "wip")])

    # Bob dropping his tag must not touch Alice's tag or her track
    bobs = client.get("/tracks", headers=bob).json()["items"][0]
    client.patch(f"/tracks/{bobs['id']}", headers=bob, json={"tags": []})
    assert tag_rows() == [(alice_id, "wip")]
    assert client.get("/tracks", headers=alice).json()["items"][0]["tags"] == ["wip"]


def test_track_id_must_be_an_integer(client, alice):
    assert client.get("/tracks/abc", headers=alice).status_code == 422

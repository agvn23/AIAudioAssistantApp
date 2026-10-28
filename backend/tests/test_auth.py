from datetime import timedelta

import pytest

pytest.importorskip("fastapi")

EMAIL = "Producer@Example.com"
PASSWORD = "correct horse battery"


def register(client, email=EMAIL, password=PASSWORD):
    return client.post("/auth/register", json={"email": email, "password": password})


def login(client, email=EMAIL, password=PASSWORD):
    # OAuth2 password flow: form fields, with the email in `username`
    return client.post("/auth/login", data={"username": email, "password": password})


def auth_header(client, email=EMAIL, password=PASSWORD):
    token = login(client, email, password).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_register_returns_the_user_without_a_password(client):
    r = register(client)
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "producer@example.com"  # normalized to lower case
    assert body["id"] >= 1
    assert "password" not in body and "password_hash" not in body


def test_password_is_stored_hashed_with_argon2(client):
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import User

    register(client)
    with SessionLocal() as db:
        user = db.scalar(select(User))
    assert user.password_hash != PASSWORD
    assert user.password_hash.startswith("$argon2")


def test_duplicate_email_is_rejected_case_insensitively(client):
    assert register(client).status_code == 201
    assert register(client, email="PRODUCER@example.COM").status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "password": PASSWORD},
        {"email": "a@example.com", "password": "short"},
        {"email": "a@example.com"},
        {},
    ],
)
def test_register_validates_input(client, payload):
    assert client.post("/auth/register", json=payload).status_code == 422


def test_login_returns_a_bearer_token_and_me_works(client):
    register(client)
    r = login(client, email="producer@example.com")  # different case than at registration
    assert r.status_code == 200
    assert r.json()["token_type"] == "bearer"

    me = client.get("/users/me", headers=auth_header(client))
    assert me.status_code == 200
    assert me.json()["email"] == "producer@example.com"


def test_wrong_password_and_unknown_email_give_the_same_error(client):
    register(client)
    wrong_password = login(client, password="not the password")
    unknown_email = login(client, email="nobody@example.com")
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()
    assert wrong_password.headers["www-authenticate"] == "Bearer"


def test_me_requires_a_valid_token(client):
    assert client.get("/users/me").status_code == 401
    assert client.get("/users/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_expired_token_is_rejected(client):
    from app.security import create_access_token

    user_id = register(client).json()["id"]
    expired = create_access_token(user_id, expires_delta=timedelta(seconds=-5))
    r = client.get("/users/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401


def test_token_for_a_deleted_user_is_rejected(client):
    from app.db import SessionLocal
    from app.models import User

    register(client)
    headers = auth_header(client)
    with SessionLocal() as db:
        db.delete(db.get(User, 1))
        db.commit()
    assert client.get("/users/me", headers=headers).status_code == 401


def test_each_user_only_sees_their_own_account(client):
    register(client, email="a@example.com")
    register(client, email="b@example.com")
    a = client.get("/users/me", headers=auth_header(client, "a@example.com")).json()
    b = client.get("/users/me", headers=auth_header(client, "b@example.com")).json()
    assert a["email"] == "a@example.com" and b["email"] == "b@example.com"
    assert a["id"] != b["id"]

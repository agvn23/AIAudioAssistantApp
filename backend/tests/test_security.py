import pytest

from app.security import hash_password, verify_password

PASSWORD = "correct horse battery"


def test_the_right_password_verifies():
    assert verify_password(PASSWORD, hash_password(PASSWORD)) is True


def test_a_wrong_password_does_not_verify():
    assert verify_password("wrong horse battery", hash_password(PASSWORD)) is False


@pytest.mark.parametrize("stored", ["", "not-a-hash", "$argon2id$garbage"])
def test_an_unreadable_stored_hash_fails_closed(stored):
    assert verify_password(PASSWORD, stored) is False

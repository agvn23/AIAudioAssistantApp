from datetime import timedelta

import jwt

from app.tokens import create_access_token, decode_access_token

SECRET = "a-test-secret-that-is-long-enough-0123456789"


def test_round_trip():
    token = create_access_token(42, SECRET)
    assert decode_access_token(token, SECRET) == 42


def test_expired_token_is_rejected():
    token = create_access_token(42, SECRET, expires_delta=timedelta(seconds=-5))
    assert decode_access_token(token, SECRET) is None


def test_token_signed_with_another_secret_is_rejected():
    token = create_access_token(42, "some-other-secret-that-is-also-long-0123456789")
    assert decode_access_token(token, SECRET) is None


def test_tampered_token_is_rejected():
    token = create_access_token(42, SECRET)
    header, payload, signature = token.split(".")
    flipped = ("A" if signature[0] != "A" else "B") + signature[1:]
    assert decode_access_token(f"{header}.{payload}.{flipped}", SECRET) is None


def test_unsigned_token_is_rejected():
    unsigned = jwt.encode({"sub": "42", "exp": 4102444800}, "", algorithm="none")
    assert decode_access_token(unsigned, SECRET) is None


def test_token_without_expiry_or_subject_is_rejected():
    no_exp = jwt.encode({"sub": "42"}, SECRET, algorithm="HS256")
    no_sub = jwt.encode({"exp": 4102444800}, SECRET, algorithm="HS256")
    assert decode_access_token(no_exp, SECRET) is None
    assert decode_access_token(no_sub, SECRET) is None


def test_non_numeric_subject_is_rejected():
    token = jwt.encode({"sub": "abc", "exp": 4102444800}, SECRET, algorithm="HS256")
    assert decode_access_token(token, SECRET) is None


def test_garbage_is_rejected():
    assert decode_access_token("not-a-token", SECRET) is None
    assert decode_access_token("", SECRET) is None

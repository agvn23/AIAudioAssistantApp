from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy.dialects import sqlite
from sqlalchemy.schema import CreateTable

from app.models import Track, User, utcnow
from app.schemas import UserRead


def _create_table_sql(model) -> str:
    return str(CreateTable(model.__table__).compile(dialect=sqlite.dialect()))


def test_utcnow_is_timezone_aware_utc():
    now = utcnow()
    assert now.tzinfo is not None
    assert now.utcoffset() == timedelta(0)


def test_users_table_never_reuses_ids_on_sqlite():
    assert "AUTOINCREMENT" in _create_table_sql(User)


def test_other_tables_do_not_use_autoincrement():
    assert "AUTOINCREMENT" not in _create_table_sql(Track)


def test_a_naive_datetime_is_read_as_utc():
    user = UserRead(id=1, email="a@example.com", created_at=datetime(2026, 1, 1, 12, 0))
    assert user.created_at == datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    assert user.created_at.utcoffset() == timedelta(0)


def test_a_datetime_with_an_offset_is_converted_to_utc():
    local = datetime(2026, 1, 1, 12, 0, tzinfo=timezone(timedelta(hours=2)))
    user = UserRead(id=1, email="a@example.com", created_at=local)
    assert user.created_at == datetime(2026, 1, 1, 10, 0, tzinfo=UTC)
    assert user.created_at.utcoffset() == timedelta(0)

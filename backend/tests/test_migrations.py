from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from app import models  # noqa: F401  (registers the tables with Base.metadata)
from app.db import Base

BACKEND_DIR = Path(__file__).resolve().parents[1]
APP_TABLES = {"users", "tracks", "tags", "track_tags", "analyses"}


def alembic_config(url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    config.attributes["configure_logger"] = False  # keep pytest's log handlers (caplog)
    return config


@pytest.fixture()
def migrated_url(tmp_path):
    url = f"sqlite:///{tmp_path / 'migrated.db'}"
    command.upgrade(alembic_config(url), "head")
    return url


def test_there_is_exactly_one_head():
    script = ScriptDirectory.from_config(alembic_config("sqlite://"))
    assert len(script.get_heads()) == 1


def test_upgrade_creates_every_table_and_records_the_revision(migrated_url):
    engine = create_engine(migrated_url)
    assert set(inspect(engine).get_table_names()) == APP_TABLES | {"alembic_version"}
    head = ScriptDirectory.from_config(alembic_config(migrated_url)).get_current_head()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar() == head


def test_the_migration_matches_the_models(migrated_url):
    """The guard against drift: change a model without writing a migration and this fails."""
    engine = create_engine(migrated_url)
    with engine.connect() as conn:
        context = MigrationContext.configure(
            conn, opts={"compare_type": True, "compare_server_default": True}
        )
        diff = compare_metadata(context, Base.metadata)
    assert diff == [], f"models and migrations disagree: {diff}"


def test_downgrade_removes_everything(tmp_path):
    url = f"sqlite:///{tmp_path / 'down.db'}"
    config = alembic_config(url)
    command.upgrade(config, "head")
    command.downgrade(config, "base")
    assert set(inspect(create_engine(url)).get_table_names()) == {"alembic_version"}


def test_every_foreign_key_is_named_and_cascades(migrated_url):
    inspector = inspect(create_engine(migrated_url))
    seen = 0
    for table in APP_TABLES:
        for fk in inspector.get_foreign_keys(table):
            seen += 1
            assert fk["name"], f"unnamed foreign key on {table}"
            assert fk["options"].get("ondelete") == "CASCADE", f"{table}: {fk['name']}"
    assert seen == 5  # tracks, tags, track_tags (two), analyses


def test_user_ids_are_never_reused(migrated_url):
    """Ties the migration to the token-reuse fix: users must be AUTOINCREMENT."""
    engine = create_engine(migrated_url)
    with engine.connect() as conn:
        sql = conn.execute(text("SELECT sql FROM sqlite_master WHERE name = 'users'")).scalar()
    assert "AUTOINCREMENT" in sql.upper()


def test_deleting_a_user_cascades_in_a_migrated_database(migrated_url):
    """End to end on the migrated schema, with foreign keys enforced like app/db.py does."""
    engine = create_engine(migrated_url)
    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.execute(
            text(
                "INSERT INTO users (email, password_hash, created_at) "
                "VALUES ('a@example.com', 'x', '2026-11-10 00:00:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO tracks (user_id, title, created_at, updated_at) "
                "VALUES (1, 'Song', '2026-11-10 00:00:00', '2026-11-10 00:00:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO analyses (track_id, version_number, original_filename, status, "
                "created_at) VALUES (1, 1, 'mix.wav', 'done', '2026-11-10 00:00:00')"
            )
        )
        conn.execute(text("DELETE FROM users WHERE id = 1"))
        assert conn.execute(text("SELECT COUNT(*) FROM tracks")).scalar() == 0
        assert conn.execute(text("SELECT COUNT(*) FROM analyses")).scalar() == 0

import os

# Must be set before the app is imported: tests use a private in-memory database.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ENVIRONMENT"] = "development"
# Pinned so a local backend/.env cannot change what the CORS tests expect.
os.environ["CORS_ORIGINS"] = "http://localhost:5173"
# Abuse protection is off by default in tests (hundreds of registrations come from one "IP").
# The tests in test_abuse_limits.py switch it on, with small limits, where they need it.
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["MAX_ACTIVE_ANALYSES_PER_USER"] = "1000"
os.environ["MAX_ACTIVE_ANALYSES_GLOBAL"] = "1000"

import shutil
import subprocess

import pytest

HAS_FFMPEG = shutil.which("ffmpeg") is not None
needs_ffmpeg = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg not on PATH")


def make_sine(path, volume_db=0.0, seconds=5, channels=1, sample_rate=48000):
    """Write a 1 kHz sine with ffmpeg. ffmpeg's sine source has amplitude 1/8 (-18.06 dBFS)."""
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-f", "lavfi", "-i", f"sine=frequency=1000:duration={seconds}:sample_rate={sample_rate}",
         "-af", f"volume={volume_db}dB", "-ac", str(channels), str(path)],
        check=True,
    )


@pytest.fixture()
def client():
    """A TestClient on a fresh, empty in-memory database."""
    from fastapi.testclient import TestClient

    from app.db import Base, engine
    from app.main import app
    from app.rate_limit import limiter

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    limiter.reset()  # the limiter is a process-wide singleton; start every test clean
    with TestClient(app) as test_client:
        yield test_client

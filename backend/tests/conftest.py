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

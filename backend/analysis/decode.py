from __future__ import annotations

import subprocess

import numpy as np

from .errors import AnalysisError


def decode_float32(
    path: str,
    channels: int = 1,
    sample_rate: int = 44100,
    max_seconds: float | None = None,
    ffmpeg_path: str = "ffmpeg",
    timeout: float = 120,
) -> np.ndarray:
    """Decode any audio file ffmpeg understands to float32 samples in [-1, 1].

    Returns shape (n,) for 1 channel and (n, channels) otherwise. A mono source asked for
    2 channels is duplicated to both. The path is passed as a list argument (never through
    a shell).
    """
    args = [ffmpeg_path, "-hide_banner", "-loglevel", "error", "-i", path, "-vn",
            "-ac", str(channels), "-ar", str(sample_rate)]
    if max_seconds is not None:
        args += ["-t", str(max_seconds)]
    args += ["-f", "f32le", "-"]

    try:
        proc = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    except FileNotFoundError as exc:
        raise AnalysisError("ffmpeg_missing", f'ffmpeg not found at "{ffmpeg_path}"') from exc
    except subprocess.TimeoutExpired as exc:
        raise AnalysisError("ffmpeg_timeout", f"ffmpeg exceeded {timeout} s") from exc

    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace").strip()
        raise AnalysisError("ffmpeg_failed", f"ffmpeg exited with code {proc.returncode}: {tail}")

    raw = proc.stdout
    frame_bytes = 4 * channels
    usable = len(raw) - (len(raw) % frame_bytes)
    if usable < frame_bytes:
        raise AnalysisError("empty_audio", "decoded audio is empty")
    audio = np.frombuffer(raw[:usable], dtype="<f4").copy()
    return audio if channels == 1 else audio.reshape(-1, channels)


def decode_mono_float32(
    path: str,
    sample_rate: int = 44100,
    max_seconds: float | None = None,
    ffmpeg_path: str = "ffmpeg",
    timeout: float = 120,
) -> np.ndarray:
    """Mono convenience wrapper. Essentia's rhythm and key algorithms expect 44100 Hz."""
    return decode_float32(path, 1, sample_rate, max_seconds, ffmpeg_path, timeout)

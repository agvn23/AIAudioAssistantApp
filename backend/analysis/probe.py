from __future__ import annotations

import json
import subprocess
from typing import Any

from .errors import AnalysisError


def probe_file(path: str, ffprobe_path: str = "ffprobe", timeout: float = 30) -> dict[str, Any]:
    """Read basic stream facts with ffprobe (ships with ffmpeg)."""
    args = [
        ffprobe_path, "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=sample_rate,channels,bits_per_raw_sample,bits_per_sample"
                         ":format=duration,format_name",
        "-of", "json", path,
    ]
    try:
        proc = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    except FileNotFoundError as exc:
        raise AnalysisError("ffprobe_missing", f'ffprobe not found at "{ffprobe_path}"') from exc
    except subprocess.TimeoutExpired as exc:
        raise AnalysisError("ffprobe_failed", f"ffprobe exceeded {timeout} s") from exc

    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace").strip()
        raise AnalysisError("ffprobe_failed", f"ffprobe exited with code {proc.returncode}: {tail}")

    try:
        data = json.loads(proc.stdout.decode("utf-8", "replace") or "{}")
    except json.JSONDecodeError as exc:
        raise AnalysisError("ffprobe_failed", "ffprobe produced unreadable output") from exc

    streams = data.get("streams") or []
    if not streams:
        raise AnalysisError("no_audio_stream", "file has no audio stream")
    stream, fmt = streams[0], data.get("format") or {}

    def _int(value: Any) -> int | None:
        try:
            n = int(value)
        except (TypeError, ValueError):
            return None
        return n if n > 0 else None

    def _float(value: Any) -> float | None:
        try:
            x = float(value)
        except (TypeError, ValueError):
            return None
        return x if x > 0 else None

    return {
        "sample_rate_hz": _int(stream.get("sample_rate")),
        "channels": _int(stream.get("channels")),
        "bit_depth": _int(stream.get("bits_per_raw_sample")) or _int(stream.get("bits_per_sample")),
        "duration_sec": _float(fmt.get("duration")),
        "format_name": str(fmt.get("format_name") or ""),
    }

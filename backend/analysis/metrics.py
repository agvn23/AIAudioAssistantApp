from __future__ import annotations

import os
from typing import Any

from .decode import decode_float32
from .dynamics import analyze_dynamics, analyze_peaks
from .loudness import analyze_loudness
from .probe import probe_file
from .spectrum import analyze_spectrum
from .stereo import analyze_stereo
from .tempo_key import analyze_tempo_and_key

SCHEMA_VERSION = "0.1"
SAMPLE_RATE = 44100
SHORT_FILE_SEC = 10
TEMPO_KEY_MAX_SEC = 240
LOW_CONFIDENCE = 0.3


def _round(value: Any, digits: int = 2) -> Any:
    """Round floats recursively and turn numpy scalars into plain Python numbers."""
    if isinstance(value, bool):
        return value
    if isinstance(value, dict):
        return {k: _round(v, digits) for k, v in value.items()}
    if isinstance(value, list):
        return [_round(v, digits) for v in value]
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float):
        return round(value, digits) + 0.0  # + 0.0 turns -0.0 into 0.0
    return value


def analyze_file(
    path: str,
    context: dict[str, str] | None = None,
    include_tempo_key: bool = True,
    key_profile: str = "edma",
    max_seconds: float = 600,
    ffmpeg_path: str = "ffmpeg",
    ffprobe_path: str = "ffprobe",
) -> dict[str, Any]:
    """Run every measurement and return a dict shaped like schema/metrics.schema.json.

    With include_tempo_key=False the `tempo` and `key` sections are left out, so the result
    will not validate (they are required by the schema); use it when essentia is unavailable.
    `context` is optional user input (genre, target_platform, stage) passed through untouched.
    """
    info = probe_file(path, ffprobe_path=ffprobe_path)
    loudness: dict[str, Any] = dict(analyze_loudness(path, ffmpeg_path=ffmpeg_path))

    audio = decode_float32(
        path, channels=2, sample_rate=SAMPLE_RATE, max_seconds=max_seconds, ffmpeg_path=ffmpeg_path
    )
    loudness.update(analyze_peaks(audio))
    dynamics = analyze_dynamics(audio, SAMPLE_RATE)
    stereo = analyze_stereo(audio)
    spectrum = analyze_spectrum(audio, SAMPLE_RATE)

    duration = info["duration_sec"] or audio.shape[0] / SAMPLE_RATE
    source_channels = info["channels"] or 2
    warnings: list[dict[str, str]] = []
    if source_channels > 2:
        warnings.append({"code": "downmixed", "message":
                         f"source has {source_channels} channels; stereo measurements use a 2-channel downmix"})
    if duration < SHORT_FILE_SEC:
        warnings.append({"code": "short_file", "message":
                         f"file is {duration:.1f} s long; tempo, key and loudness range are less reliable"})
    if duration > max_seconds:
        warnings.append({"code": "analysis_truncated", "message":
                         f"spectrum, stereo and dynamics use the first {int(max_seconds)} s only"})
    if loudness["clipped_samples"] > 0:
        warnings.append({"code": "possible_clipping", "message":
                         f"{loudness['clipped_samples']} samples at or near full scale"})

    result: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "file": {
            "name": os.path.basename(path),
            "format": os.path.splitext(path)[1].lstrip(".").lower()
                      or info["format_name"].split(",")[0],
            "duration_sec": duration,
            "sample_rate_hz": info["sample_rate_hz"] or SAMPLE_RATE,
            "bit_depth": info["bit_depth"],
            "channels": min(source_channels, 2),
        },
        "loudness": loudness,
        "dynamics": dynamics,
        "spectrum": spectrum,
        "stereo": stereo,
    }
    if context:
        result["context"] = dict(context)

    if include_tempo_key:
        tk = analyze_tempo_and_key(
            path, max_seconds=TEMPO_KEY_MAX_SEC, key_profile=key_profile, ffmpeg_path=ffmpeg_path
        )
        result["tempo"], result["key"] = tk["tempo"], tk["key"]
        if duration > TEMPO_KEY_MAX_SEC:
            warnings.append({"code": "tempo_key_truncated", "message":
                             f"tempo and key use the first {TEMPO_KEY_MAX_SEC} s only"})
        if tk["tempo"]["confidence"] < LOW_CONFIDENCE:
            warnings.append({"code": "low_tempo_confidence", "message":
                             "tempo estimate has low confidence; treat BPM as a suggestion"})
        if tk["key"]["confidence"] < LOW_CONFIDENCE:
            warnings.append({"code": "low_key_confidence", "message":
                             "key estimate has low confidence; treat it as a suggestion"})

    if warnings:
        result["warnings"] = warnings
    return _round(result)

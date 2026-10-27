from __future__ import annotations

from typing import Any

from .decode import decode_mono_float32
from .errors import AnalysisError
from .tempo_key_utils import (
    half_double_alternatives,
    normalize_key_strength,
    normalize_mode,
    normalize_rhythm_confidence,
    normalize_tonic,
)

SAMPLE_RATE = 44100


def analyze_tempo_and_key(
    path: str,
    max_seconds: float = 240,
    key_profile: str = "edma",
    ffmpeg_path: str = "ffmpeg",
) -> dict[str, dict[str, Any]]:
    """Estimate BPM and key with essentia. Returns {"tempo": {...}, "key": {...}}.

    Both sections match schema/metrics.schema.json. `key_profile` is an essentia profile:
    "edma" is tuned for electronic dance music, "bgate" is essentia's general default;
    worth comparing on your own tracks.
    """
    try:
        import essentia.standard as es
    except ImportError as exc:
        raise AnalysisError(
            "essentia_missing", "essentia is not installed (pip install essentia)"
        ) from exc

    audio = decode_mono_float32(
        path, sample_rate=SAMPLE_RATE, max_seconds=max_seconds, ffmpeg_path=ffmpeg_path
    )

    bpm, _ticks, confidence, _estimates, _intervals = es.RhythmExtractor2013(
        method="multifeature"
    )(audio)
    bpm_value = round(float(bpm), 1) if bpm and float(bpm) > 0 else None
    tempo: dict[str, Any] = {
        "bpm": bpm_value,
        "confidence": normalize_rhythm_confidence(float(confidence)),
    }
    if bpm_value is not None:
        tempo["alternative_bpms"] = half_double_alternatives(bpm_value)

    key, scale, strength = es.KeyExtractor(profileType=key_profile)(audio)
    key_result = {
        "tonic": normalize_tonic(key),
        "mode": normalize_mode(scale),
        "confidence": normalize_key_strength(float(strength)),
    }
    return {"tempo": tempo, "key": key_result}

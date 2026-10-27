from __future__ import annotations

TONICS = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")

_ENHARMONIC_TO_SHARP = {
    "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#",
    "Cb": "B", "Fb": "E", "E#": "F", "B#": "C",
}

# RhythmExtractor2013 ("multifeature") reports confidence on a 0 to about 5.32 scale.
RHYTHM_CONFIDENCE_MAX = 5.32


def normalize_tonic(name: str | None) -> str | None:
    """Map essentia key names (which may use flats) onto the schema's sharp-only list."""
    if not name:
        return None
    name = name.strip()
    if name in TONICS:
        return name
    return _ENHARMONIC_TO_SHARP.get(name)


def normalize_mode(scale: str | None) -> str | None:
    s = (scale or "").strip().lower()
    return s if s in ("major", "minor") else None


def normalize_rhythm_confidence(raw: float) -> float:
    if raw != raw or raw <= 0:  # NaN or non-positive
        return 0.0
    return min(1.0, raw / RHYTHM_CONFIDENCE_MAX)


def normalize_key_strength(raw: float) -> float:
    """KeyExtractor strength is a correlation-like value; clamp it into 0..1."""
    if raw != raw or raw <= 0:
        return 0.0
    return min(1.0, raw)


def half_double_alternatives(bpm: float, lo: float = 40, hi: float = 300) -> list[float]:
    """Half-time and double-time candidates within the schema's plausible range."""
    candidates = [round(bpm / 2, 1), round(bpm * 2, 1)]
    return [c for c in candidates if lo <= c <= hi]

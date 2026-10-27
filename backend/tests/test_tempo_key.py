"""Smoke tests for the essentia integration. Skipped unless essentia is installed."""
import wave

import numpy as np
import pytest

pytest.importorskip("essentia")

from analysis.tempo_key import analyze_tempo_and_key  # noqa: E402


def _write_click_track(path, bpm=120, seconds=20, sr=44100):
    """A clean click on every beat: about the easiest thing a tempo tracker can be given."""
    samples = np.zeros(seconds * sr, dtype=np.float32)
    click = np.hanning(200).astype(np.float32)
    for t in np.arange(0, seconds, 60 / bpm):
        i = int(t * sr)
        samples[i : i + 200] += click
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def test_click_track_tempo_is_found(tmp_path):
    f = tmp_path / "clicks.wav"
    _write_click_track(f, bpm=120)
    result = analyze_tempo_and_key(str(f))
    bpm = result["tempo"]["bpm"]
    assert bpm is not None
    # Allow the half/double-time ambiguity every tempo tracker has.
    assert any(abs(bpm - target) < 3 for target in (60, 120, 240))


def test_result_shape_matches_schema_sections(tmp_path):
    f = tmp_path / "clicks.wav"
    _write_click_track(f)
    result = analyze_tempo_and_key(str(f))
    assert set(result) == {"tempo", "key"}
    assert 0 <= result["tempo"]["confidence"] <= 1
    assert 0 <= result["key"]["confidence"] <= 1
    assert result["key"]["mode"] in ("major", "minor", None)

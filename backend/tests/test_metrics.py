import json
import subprocess
from pathlib import Path

import pytest

from analysis.metrics import analyze_file
from conftest import needs_ffmpeg

jsonschema = pytest.importorskip("jsonschema")

SCHEMA = Path(__file__).resolve().parents[2] / "schema" / "metrics.schema.json"


def _stereo_file(path):
    """5 s stereo file: different tones in each channel plus some noise."""
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=5:sample_rate=48000",
         "-f", "lavfi", "-i", "sine=frequency=660:duration=5:sample_rate=48000",
         "-filter_complex", "[0][1]amerge=inputs=2", str(path)],
        check=True,
    )


@needs_ffmpeg
def test_sections_without_tempo_key(tmp_path):
    f = tmp_path / "tones.wav"
    _stereo_file(f)
    r = analyze_file(str(f), include_tempo_key=False)
    assert "tempo" not in r and "key" not in r
    assert r["file"]["channels"] == 2
    assert r["file"]["name"] == "tones.wav"
    assert r["file"]["duration_sec"] == pytest.approx(5.0, abs=0.2)
    assert {w["code"] for w in r["warnings"]} >= {"short_file"}
    json.dumps(r)  # must be plain JSON types


@needs_ffmpeg
def test_result_matches_schema_when_tempo_key_are_present(tmp_path):
    f = tmp_path / "tones.wav"
    _stereo_file(f)
    r = analyze_file(str(f), context={"genre": "house", "target_platform": "spotify", "stage": "mix"},
                     include_tempo_key=False)
    # Stand-ins for the essentia sections so the rest can be validated anywhere.
    r["tempo"] = {"bpm": 120.0, "confidence": 0.5, "alternative_bpms": [60.0, 240.0]}
    r["key"] = {"tonic": "C", "mode": "major", "confidence": 0.5}
    schema = json.loads(SCHEMA.read_text())
    jsonschema.validate(r, schema)


@needs_ffmpeg
def test_full_analysis_matches_schema_with_essentia(tmp_path):
    pytest.importorskip("essentia")
    f = tmp_path / "tones.wav"
    _stereo_file(f)
    r = analyze_file(str(f))
    jsonschema.validate(r, json.loads(SCHEMA.read_text()))

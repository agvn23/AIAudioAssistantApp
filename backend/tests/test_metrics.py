import json
import subprocess
from pathlib import Path

import pytest

from analysis.metrics import analyze_file, true_peak_warning
from conftest import needs_ffmpeg

jsonschema = pytest.importorskip("jsonschema")

SCHEMA = Path(__file__).resolve().parents[2] / "schema" / "metrics.schema.json"

TRUE_PEAK_CODE = "true_peak_above_0dbtp"


def _stereo_file(path):
    """5 s stereo file: different tones in each channel plus some noise."""
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=5:sample_rate=48000",
         "-f", "lavfi", "-i", "sine=frequency=660:duration=5:sample_rate=48000",
         "-filter_complex", "[0][1]amerge=inputs=2", str(path)],
        check=True,
    )


def _clipped_file(path):
    """5 s stereo file of two high sines, boosted 16x and hard-clipped when written as 16-bit.
    Every sample stays inside full scale, but the reconstructed waveform overshoots, so the
    true peak is above 0 dBTP (about +3 dBTP when measured with ffmpeg 6.1)."""
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-f", "lavfi", "-i", "sine=frequency=10000:duration=5:sample_rate=44100",
         "-f", "lavfi", "-i", "sine=frequency=9000:duration=5:sample_rate=44100",
         "-filter_complex", "[0][1]amerge=inputs=2,aformat=sample_fmts=fltp,volume=16",
         "-c:a", "pcm_s16le", str(path)],
        check=True,
    )


def _codes(result):
    return [w["code"] for w in result.get("warnings", [])]


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


# --- true peak above 0 dBTP --------------------------------------------------------------------


@pytest.mark.parametrize(
    "true_peak", [-6.0, -0.01, 0.0, 0.004, float("nan"), float("-inf"), None]
)
def test_no_true_peak_warning_at_or_below_zero(true_peak):
    assert true_peak_warning(true_peak) is None


@pytest.mark.parametrize(
    ("true_peak", "shown"), [(0.01, "0.01"), (1.2, "1.20"), (3.456, "3.46")]
)
def test_true_peak_above_zero_gives_a_warning(true_peak, shown):
    warning = true_peak_warning(true_peak)
    assert warning is not None
    assert set(warning) == {"code", "message"}
    assert warning["code"] == TRUE_PEAK_CODE
    assert f"{shown} dBTP" in warning["message"]


def test_the_true_peak_warning_matches_the_schema():
    warning = true_peak_warning(1.2)
    schema = json.loads(SCHEMA.read_text())
    jsonschema.validate(warning, schema["properties"]["warnings"]["items"])


@needs_ffmpeg
def test_a_quiet_file_has_no_true_peak_warning(tmp_path):
    f = tmp_path / "tones.wav"
    _stereo_file(f)
    r = analyze_file(str(f), include_tempo_key=False)
    assert r["loudness"]["true_peak_dbtp"] < 0
    assert TRUE_PEAK_CODE not in _codes(r)


@needs_ffmpeg
def test_a_hard_clipped_file_gets_the_true_peak_warning(tmp_path):
    f = tmp_path / "clipped.wav"
    _clipped_file(f)
    r = analyze_file(str(f), include_tempo_key=False)
    assert r["loudness"]["true_peak_dbtp"] > 0
    assert _codes(r).count(TRUE_PEAK_CODE) == 1
    json.dumps(r)  # still plain JSON

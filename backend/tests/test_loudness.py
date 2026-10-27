import pytest

from analysis.errors import AnalysisError
from analysis.loudness import analyze_loudness, parse_ebur128_output
from conftest import make_sine, needs_ffmpeg

SAMPLE_OUTPUT = """
[Parsed_ebur128_0 @ 0x1] t: 0.1      TARGET:-23 LUFS    M:-120.7 S:-120.7     I: -70.0 LUFS       LRA:   0.0 LU
[Parsed_ebur128_0 @ 0x1] t: 3.5      TARGET:-23 LUFS    M: -18.4 S: -19.1     I: -18.9 LUFS       LRA:   0.0 LU
[Parsed_ebur128_0 @ 0x1] t: 4.9      TARGET:-23 LUFS    M: -17.9 S: -18.6     I: -18.7 LUFS       LRA:   0.3 LU
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -18.7 LUFS
    Threshold: -28.7 LUFS

  Loudness range:
    LRA:         5.2 LU
    Threshold: -38.7 LUFS
    LRA low:   -24.0 LUFS
    LRA high:  -18.8 LUFS

  True peak:
    Peak:       -1.3 dBFS
"""


def test_parse_reads_summary_values():
    r = parse_ebur128_output(SAMPLE_OUTPUT)
    assert r["integrated_lufs"] == -18.7
    assert r["loudness_range_lu"] == 5.2
    assert r["true_peak_dbtp"] == -1.3


def test_parse_takes_maxima_from_frames_ignoring_unfilled_windows():
    r = parse_ebur128_output(SAMPLE_OUTPUT)
    assert r["momentary_max_lufs"] == -17.9
    assert r["short_term_max_lufs"] == -18.6


def test_parse_without_summary_fails():
    with pytest.raises(AnalysisError) as exc:
        parse_ebur128_output("nothing useful")
    assert exc.value.code == "parse_failed"


def test_parse_silent_audio():
    silent = SAMPLE_OUTPUT.replace("I:         -18.7 LUFS", "I:         -inf LUFS")
    with pytest.raises(AnalysisError) as exc:
        parse_ebur128_output(silent)
    assert exc.value.code == "silent"


@needs_ffmpeg
def test_six_db_louder_file_measures_about_six_lu_louder(tmp_path):
    quiet, loud = tmp_path / "quiet.wav", tmp_path / "loud.wav"
    make_sine(quiet, -6)
    make_sine(loud, 0)
    diff = analyze_loudness(str(loud))["integrated_lufs"] - analyze_loudness(str(quiet))["integrated_lufs"]
    assert diff == pytest.approx(6.02, abs=0.5)


@needs_ffmpeg
def test_true_peak_matches_sine_level(tmp_path):
    loud = tmp_path / "loud.wav"
    make_sine(loud, 0)
    assert analyze_loudness(str(loud))["true_peak_dbtp"] == pytest.approx(-18.06, abs=0.5)


@needs_ffmpeg
def test_bad_ffmpeg_path(tmp_path):
    f = tmp_path / "a.wav"
    make_sine(f)
    with pytest.raises(AnalysisError) as exc:
        analyze_loudness(str(f), ffmpeg_path="/no/such/ffmpeg")
    assert exc.value.code == "ffmpeg_missing"


@needs_ffmpeg
def test_missing_input_file(tmp_path):
    with pytest.raises(AnalysisError) as exc:
        analyze_loudness(str(tmp_path / "nope.wav"))
    assert exc.value.code == "ffmpeg_failed"

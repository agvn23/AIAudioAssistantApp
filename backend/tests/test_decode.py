import numpy as np
import pytest

from analysis.decode import decode_mono_float32
from analysis.errors import AnalysisError
from conftest import make_sine, needs_ffmpeg


@needs_ffmpeg
def test_resamples_to_44100_mono_float(tmp_path):
    f = tmp_path / "stereo48k.wav"
    make_sine(f, seconds=2, channels=2, sample_rate=48000)
    audio = decode_mono_float32(str(f))
    assert audio.dtype == np.float32 and audio.ndim == 1
    assert abs(len(audio) - 2 * 44100) < 200
    assert 0.1 < float(np.max(np.abs(audio))) < 0.15


@needs_ffmpeg
def test_max_seconds(tmp_path):
    f = tmp_path / "a.wav"
    make_sine(f, seconds=2)
    assert abs(len(decode_mono_float32(str(f), max_seconds=1)) - 44100) < 200


@needs_ffmpeg
def test_errors(tmp_path):
    f = tmp_path / "a.wav"
    make_sine(f, seconds=1)
    with pytest.raises(AnalysisError) as exc:
        decode_mono_float32(str(f), ffmpeg_path="/no/such/ffmpeg")
    assert exc.value.code == "ffmpeg_missing"
    with pytest.raises(AnalysisError) as exc:
        decode_mono_float32(str(tmp_path / "nope.wav"))
    assert exc.value.code == "ffmpeg_failed"


@needs_ffmpeg
def test_stereo_decode_has_two_columns(tmp_path):
    from analysis.decode import decode_float32

    f = tmp_path / "a.wav"
    make_sine(f, seconds=1, channels=2)
    audio = decode_float32(str(f), channels=2)
    assert audio.ndim == 2 and audio.shape[1] == 2
    assert abs(audio.shape[0] - 44100) < 200

import numpy as np
import pytest

from analysis.stereo import analyze_stereo

RNG = np.random.default_rng(1)
N = 44100 * 3


def test_identical_channels_are_mono():
    x = RNG.standard_normal(N).astype(np.float32)
    s = analyze_stereo(np.stack([x, x], axis=1))
    assert s["phase_correlation"] == pytest.approx(1.0, abs=1e-6)
    assert s["width"] == pytest.approx(0.0, abs=1e-6)
    assert s["is_mono"] is True
    assert s["mono_compatible"] is True
    assert "side_to_mid_db" not in s


def test_inverted_channels_are_not_mono_compatible():
    x = RNG.standard_normal(N).astype(np.float32)
    s = analyze_stereo(np.stack([x, -x], axis=1))
    assert s["phase_correlation"] == pytest.approx(-1.0, abs=1e-6)
    assert s["width"] == pytest.approx(1.0, abs=1e-6)
    assert s["mono_compatible"] is False
    assert s["is_mono"] is False


def test_unrelated_channels_are_wide_but_uncorrelated():
    left = RNG.standard_normal(N).astype(np.float32)
    right = RNG.standard_normal(N).astype(np.float32)
    s = analyze_stereo(np.stack([left, right], axis=1))
    assert abs(s["phase_correlation"]) < 0.05
    assert s["width"] == pytest.approx(0.5, abs=0.05)
    assert s["side_to_mid_db"] == pytest.approx(0.0, abs=0.5)
    assert s["mono_compatible"] is True


def test_one_dimensional_input_is_treated_as_mono():
    x = RNG.standard_normal(N).astype(np.float32)
    assert analyze_stereo(x)["is_mono"] is True


def test_silence_does_not_crash():
    s = analyze_stereo(np.zeros((1000, 2), dtype=np.float32))
    assert s["phase_correlation"] == 0.0
    assert s["is_mono"] is True

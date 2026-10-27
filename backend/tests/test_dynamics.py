import math

import numpy as np
import pytest

from analysis.dynamics import analyze_dynamics, analyze_peaks

SR = 44100


def _sine(amplitude, seconds=10, freq=1000.0):
    t = np.arange(int(seconds * SR)) / SR
    return (amplitude * np.sin(2 * math.pi * freq * t)).astype(np.float32)


def test_sine_rms_and_crest():
    d = analyze_dynamics(_sine(0.5))
    assert d["rms_dbfs"] == pytest.approx(20 * math.log10(0.5 / math.sqrt(2)), abs=0.05)
    assert d["crest_factor_db"] == pytest.approx(3.01, abs=0.05)


def test_square_wave_has_zero_crest_factor():
    square = np.sign(_sine(0.5)) * 0.5
    assert analyze_dynamics(square)["crest_factor_db"] == pytest.approx(0.0, abs=0.05)


def test_dynamic_range_of_steady_sine_is_about_3_db():
    assert analyze_dynamics(_sine(0.5))["dynamic_range_db"] == pytest.approx(3.01, abs=0.2)


def test_dynamic_range_grows_when_peaks_stand_out_above_the_loud_sections():
    steady = _sine(0.5, seconds=30)
    peaky = steady.copy()
    peaky[1 * SR] = 0.95  # two brief peaks in different 3 s blocks
    peaky[15 * SR] = 0.95
    assert analyze_dynamics(peaky)["dynamic_range_db"] > analyze_dynamics(steady)["dynamic_range_db"] + 3


def test_works_on_stereo_arrays():
    stereo = np.stack([_sine(0.5), _sine(0.25)], axis=1)
    d = analyze_dynamics(stereo)
    assert set(d) == {"rms_dbfs", "crest_factor_db", "dynamic_range_db"}


def test_peaks_and_clipping():
    x = np.zeros(1000, dtype=np.float32)
    x[[10, 20, 30]] = 1.0
    p = analyze_peaks(x)
    assert p["clipped_samples"] == 3
    assert p["sample_peak_dbfs"] == pytest.approx(0.0, abs=0.001)
    assert analyze_peaks(_sine(0.5))["clipped_samples"] == 0

import math

import numpy as np
import pytest

from analysis.spectrum import BANDS, analyze_spectrum

SR = 44100
SECONDS = 20


def _white(seed=0):
    return np.random.default_rng(seed).standard_normal(SECONDS * SR)


def _pink(seed=0):
    spectrum = np.fft.rfft(_white(seed))
    freqs = np.fft.rfftfreq(SECONDS * SR, 1 / SR)
    freqs[0] = freqs[1]
    return np.fft.irfft(spectrum / np.sqrt(freqs), n=SECONDS * SR)


def test_band_layout():
    r = analyze_spectrum(_white().astype(np.float32))
    assert [b["name"] for b in r["bands"]] == [name for name, _, _ in BANDS]
    assert all(b["low_hz"] < b["high_hz"] for b in r["bands"])


def test_pink_noise_is_flat_across_bands_with_minus_3_db_tilt():
    r = analyze_spectrum(_pink().astype(np.float32))
    for band in r["bands"]:
        assert abs(band["relative_db"]) < 2.0, band
    assert r["tilt_db_per_octave"] == pytest.approx(-3.0, abs=0.5)


def test_white_noise_has_no_tilt_and_rising_bands():
    r = analyze_spectrum(_white().astype(np.float32))
    assert r["tilt_db_per_octave"] == pytest.approx(0.0, abs=0.5)
    levels = [b["relative_db"] for b in r["bands"]]
    assert levels[-1] > levels[0] + 10  # energy per octave grows with bandwidth


def test_centroid_of_a_sine_is_its_frequency():
    t = np.arange(SECONDS * SR) / SR
    sine = np.sin(2 * math.pi * 1000 * t).astype(np.float32)
    assert analyze_spectrum(sine)["spectral_centroid_hz"] == pytest.approx(1000, abs=60)


def test_accepts_stereo_arrays():
    stereo = np.stack([_pink(1), _pink(2)], axis=1).astype(np.float32)
    assert len(analyze_spectrum(stereo)["bands"]) == len(BANDS)

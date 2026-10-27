from __future__ import annotations

import math

import numpy as np
from scipy.signal import welch

BANDS: list[tuple[str, float, float]] = [
    ("sub", 20, 60),
    ("bass", 60, 250),
    ("low_mid", 250, 500),
    ("mid", 500, 2000),
    ("high_mid", 2000, 6000),
    ("high", 6000, 12000),
    ("air", 12000, 20000),
]
_FLOOR_DB = -200.0


def _db10(x: float) -> float:
    return 10.0 * math.log10(x) if x > 0 else _FLOOR_DB


def analyze_spectrum(
    audio: np.ndarray, sample_rate: int = 44100, nperseg: int = 8192
) -> dict:
    """Average spectrum summary of the mono mix.

    Band values are energy per octave, in dB, relative to the average across the bands.
    Pink noise (equal energy per octave) reads 0 dB in every band, so compare against genre
    reference curves rather than expecting 0: real music usually falls off towards the top.
    tilt_db_per_octave is the slope of the average power spectrum over 40 Hz-16 kHz
    (pink noise is about -3, white noise about 0).
    """
    x = np.asarray(audio, dtype=np.float64)
    mono = x.mean(axis=1) if x.ndim == 2 else x
    freqs, psd = welch(mono, fs=sample_rate, window="hann", nperseg=min(nperseg, len(mono)))
    df = float(freqs[1] - freqs[0])

    per_octave_db: list[float] = []
    for _name, lo, hi in BANDS:
        mask = (freqs >= lo) & (freqs < hi)
        energy = float(psd[mask].sum()) * df
        per_octave_db.append(_db10(energy / math.log2(hi / lo)))
    reference = float(np.mean(per_octave_db))
    bands = [
        {"name": name, "low_hz": lo, "high_hz": hi, "relative_db": db - reference}
        for (name, lo, hi), db in zip(BANDS, per_octave_db, strict=True)
    ]

    total = float(psd.sum())
    in_range = (freqs >= 20) & (freqs <= 20000)
    centroid = float((freqs[in_range] * psd[in_range]).sum() / psd[in_range].sum()) if total > 0 else 0.0

    return {
        "bands": bands,
        "spectral_centroid_hz": centroid,
        "tilt_db_per_octave": _tilt(freqs, psd),
    }


def _tilt(freqs: np.ndarray, psd: np.ndarray) -> float:
    """Slope of mean PSD (dB) against log2(frequency), in 1/3-octave bins, 40 Hz-16 kHz."""
    edges = 40.0 * 2.0 ** (np.arange(0, 27) / 3.0)
    edges = edges[edges <= 16000.0]
    xs: list[float] = []
    ys: list[float] = []
    for lo, hi in zip(edges[:-1], edges[1:], strict=True):
        mask = (freqs >= lo) & (freqs < hi)
        if not mask.any():
            continue
        mean_psd = float(psd[mask].mean())
        if mean_psd <= 0:
            continue
        xs.append(math.log2(math.sqrt(lo * hi)))
        ys.append(_db10(mean_psd))
    if len(xs) < 3:
        return 0.0
    return float(np.polyfit(xs, ys, 1)[0])

from __future__ import annotations

import math

import numpy as np

_FLOOR = 1e-10
CLIP_THRESHOLD = 0.999


def _db20(x: float) -> float:
    return 20.0 * math.log10(max(x, _FLOOR))


def analyze_peaks(audio: np.ndarray) -> dict[str, float | int]:
    """Sample peak and clipped-sample count. Approximate: measured on audio resampled to
    44.1 kHz. For inter-sample overshoot use the true peak from the loudness analysis.

    `audio` is float samples in [-1, 1], shape (n,) or (n, channels).
    """
    mag = np.abs(audio)
    return {
        "sample_peak_dbfs": _db20(float(mag.max())),
        "clipped_samples": int(np.count_nonzero(mag >= CLIP_THRESHOLD)),
    }


def analyze_dynamics(audio: np.ndarray, sample_rate: int = 44100) -> dict[str, float]:
    """RMS level, crest factor and an approximate DR value.

    rms_dbfs uses the power average over all channels (a full-scale sine reads -3.01 dBFS).
    crest_factor_db is sample peak minus that RMS, in dB.
    dynamic_range_db is a simplified version of the common "DR" meter idea: per channel,
    the second-highest 3 s block peak versus the RMS of the loudest 20% of 3 s blocks,
    averaged over channels. It is an approximation, not a certified DR14 reading.
    """
    x = np.asarray(audio, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]

    mean_square = float(np.mean(x**2))
    rms_db = 10.0 * math.log10(max(mean_square, _FLOOR**2))
    peak_db = _db20(float(np.abs(x).max()))

    return {
        "rms_dbfs": rms_db,
        "crest_factor_db": peak_db - rms_db,
        "dynamic_range_db": _approx_dr(x, sample_rate),
    }


def _approx_dr(x: np.ndarray, sample_rate: int) -> float:
    block = int(3 * sample_rate)
    n_blocks = x.shape[0] // block
    values: list[float] = []
    for ch in range(x.shape[1]):
        c = x[:, ch]
        if n_blocks < 2:  # too short for blocks: use the whole signal
            rms = math.sqrt(float(np.mean(c**2)))
            peak = float(np.abs(c).max())
        else:
            blocks = c[: n_blocks * block].reshape(n_blocks, block)
            block_rms = np.sqrt(np.mean(blocks**2, axis=1))
            block_peak = np.abs(blocks).max(axis=1)
            k = max(1, math.ceil(0.2 * n_blocks))
            rms = math.sqrt(float(np.mean(np.sort(block_rms)[-k:] ** 2)))
            peak = float(np.sort(block_peak)[-2])
        if rms > _FLOOR:
            values.append(_db20(peak) - _db20(rms))
    return max(0.0, float(np.mean(values))) if values else 0.0

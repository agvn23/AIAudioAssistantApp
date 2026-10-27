from __future__ import annotations

import math

import numpy as np

_EPS = 1e-20
MONO_COMPAT_MIN_CORR = -0.1
MONO_THRESHOLD = 1e-6  # side/total energy below this (about -60 dB) counts as mono


def analyze_stereo(audio: np.ndarray) -> dict[str, float | bool]:
    """Stereo field measurements over the whole file.

    phase_correlation: Pearson correlation of L and R (+1 identical, 0 unrelated, -1 inverted).
    width: share of energy in the side signal, 0 (mono) to 1 (fully out of phase);
           two unrelated channels of equal level give about 0.5.
    side_to_mid_db: side energy relative to mid energy (omitted when either is zero).
    mono_compatible: True when the average correlation is not meaningfully negative
           (above -0.1), a rough guide that the mix will not cancel when summed to mono.
    """
    x = np.asarray(audio, dtype=np.float64)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    left, right = x[:, 0], x[:, 1]

    mid, side = (left + right) / 2.0, (left - right) / 2.0
    e_mid, e_side = float(np.sum(mid**2)), float(np.sum(side**2))
    e_total = e_mid + e_side

    denom = math.sqrt(float(np.sum(left**2)) * float(np.sum(right**2)))
    corr = float(np.sum(left * right)) / denom if denom > _EPS else 0.0
    corr = max(-1.0, min(1.0, corr))

    if e_total <= _EPS:
        return {"phase_correlation": 0.0, "width": 0.0, "mono_compatible": True, "is_mono": True}

    result: dict[str, float | bool] = {
        "phase_correlation": corr,
        "width": e_side / e_total,
        "mono_compatible": corr > MONO_COMPAT_MIN_CORR,
        "is_mono": (e_side / e_total) < MONO_THRESHOLD,
    }
    if e_side > _EPS and e_mid > _EPS:
        result["side_to_mid_db"] = 10.0 * math.log10(e_side / e_mid)
    return result

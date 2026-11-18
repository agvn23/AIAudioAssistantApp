import numpy as np
import pytest

from analysis.tempo_key_utils import (
    half_double_alternatives,
    normalize_key_strength,
    normalize_mode,
    normalize_rhythm_confidence,
    normalize_tonic,
)


def test_tonic_keeps_sharps_and_converts_flats():
    assert normalize_tonic("C#") == "C#"
    assert normalize_tonic("Bb") == "A#"
    assert normalize_tonic("Eb") == "D#"


def test_tonic_unknown_or_missing_is_none():
    assert normalize_tonic("H") is None
    assert normalize_tonic(None) is None


def test_mode_accepts_major_minor_any_case():
    assert normalize_mode("Minor") == "minor"
    assert normalize_mode("major") == "major"
    assert normalize_mode("dorian") is None


def test_rhythm_confidence_scaling():
    assert normalize_rhythm_confidence(0) == 0
    assert normalize_rhythm_confidence(5.32) == 1
    assert normalize_rhythm_confidence(10) == 1
    assert normalize_rhythm_confidence(2.66) == pytest.approx(0.5, abs=0.01)
    assert normalize_rhythm_confidence(float("nan")) == 0


def test_key_strength_clamped():
    assert normalize_key_strength(-0.2) == 0
    assert normalize_key_strength(0.73) == 0.73
    assert normalize_key_strength(1.4) == 1


def test_half_double_alternatives():
    assert half_double_alternatives(128) == [64, 256]
    assert half_double_alternatives(170) == [85]
    assert half_double_alternatives(60) == [120]


@pytest.mark.parametrize("nan", [float("nan"), np.float32("nan"), np.float64("nan")])
def test_nan_gives_zero_confidence(nan):
    assert normalize_rhythm_confidence(nan) == 0.0
    assert normalize_key_strength(nan) == 0.0


@pytest.mark.parametrize("value", [float("inf"), np.float32("inf")])
def test_infinity_is_clamped_to_one(value):
    assert normalize_rhythm_confidence(value) == 1.0
    assert normalize_key_strength(value) == 1.0

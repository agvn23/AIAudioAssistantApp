import pytest

from app.services.feedback.references import reference_for

LOUDNESS = {"integrated_lufs": -10.4, "true_peak_dbtp": 1.2}


@pytest.mark.parametrize(
    ("name", "platform"),
    [
        ("spotify", "spotify"),
        ("Spotify", "spotify"),
        ("  SPOTIFY ", "spotify"),
        ("Apple Music", "apple_music"),
        ("apple-music", "apple_music"),
        ("apple", "apple_music"),
        ("YouTube", "youtube"),
        ("YouTube Music", "youtube"),
        ("EBU R128", "broadcast"),
        ("broadcast", "broadcast"),
    ],
)
def test_platform_names_are_normalised(name, platform):
    assert reference_for(name, LOUDNESS)["platform"] == platform


@pytest.mark.parametrize("name", [None, "", "club", "other", "somewhere else"])
def test_platforms_without_a_loudness_target_have_no_reference(name):
    assert reference_for(name, LOUDNESS) is None


def test_spotify_values_and_differences():
    ref = reference_for("spotify", LOUDNESS)
    assert ref["integrated_lufs"] == -14.0
    assert ref["true_peak_ceiling_dbtp"] == -1.0
    assert ref["integrated_lufs_difference"] == 3.6  # louder than the reference level
    assert ref["true_peak_over_ceiling_db"] == 2.2  # above the ceiling
    assert "Spotify" in ref["basis"]


def test_quieter_track_gives_negative_differences():
    ref = reference_for("spotify", {"integrated_lufs": -16.0, "true_peak_dbtp": -3.0})
    assert ref["integrated_lufs_difference"] == -2.0
    assert ref["true_peak_over_ceiling_db"] == -2.0


def test_missing_measurements_leave_out_the_differences():
    for loudness in ({}, None, {"integrated_lufs": True}):
        ref = reference_for("spotify", loudness)
        assert "integrated_lufs_difference" not in ref
        assert "true_peak_over_ceiling_db" not in ref
        assert ref["integrated_lufs"] == -14.0
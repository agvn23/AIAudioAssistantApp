"""Typical loudness guidance per target platform, and how far a track is from it.

This is reference data, not a measurement of the track. The differences are computed here
(not by the model) so they are exact and can be checked like any other cited number.
Only Spotify publishes its number itself; the others are commonly cited, and `basis` says so.
Review these values now and then and note any change in docs/DECISIONS.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

_COMMONLY_CITED = "Commonly cited guidance, not a number the platform publishes."


@dataclass(frozen=True)
class PlatformReference:
    platform: str
    integrated_lufs: float
    true_peak_ceiling_dbtp: float
    basis: str


PLATFORM_REFERENCES: dict[str, PlatformReference] = {
    "spotify": PlatformReference(
        "spotify", -14.0, -1.0, "Published by Spotify (loudness normalization help page)."
    ),
    "apple_music": PlatformReference("apple_music", -16.0, -1.0, _COMMONLY_CITED),
    "youtube": PlatformReference(
        "youtube", -14.0, -1.0, _COMMONLY_CITED + " YouTube only turns louder tracks down."
    ),
    "broadcast": PlatformReference(
        "broadcast", -23.0, -1.0, "EBU R128 (Europe). US broadcast uses -24 LKFS instead."
    ),
}

_ALIASES = {
    "apple": "apple_music",
    "applemusic": "apple_music",
    "youtube_music": "youtube",
    "ebu": "broadcast",
    "ebu_r128": "broadcast",
    "r128": "broadcast",
}


def _normalise(name: str | None) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_")
    return _ALIASES.get(key, key)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def reference_for(target_platform: str | None, loudness: dict[str, Any] | None) -> dict[str, Any] | None:
    """The reference section for the LLM input, or None when the platform has no loudness
    target (club, other, unknown). A positive difference means louder / higher than the
    reference."""
    reference = PLATFORM_REFERENCES.get(_normalise(target_platform))
    if reference is None:
        return None

    out: dict[str, Any] = {
        "platform": reference.platform,
        "integrated_lufs": reference.integrated_lufs,
        "true_peak_ceiling_dbtp": reference.true_peak_ceiling_dbtp,
        "basis": reference.basis,
    }
    loudness = loudness or {}
    lufs = loudness.get("integrated_lufs")
    true_peak = loudness.get("true_peak_dbtp")
    if _is_number(lufs):
        out["integrated_lufs_difference"] = round(lufs - reference.integrated_lufs, 2)
    if _is_number(true_peak):
        out["true_peak_over_ceiling_db"] = round(true_peak - reference.true_peak_ceiling_dbtp, 2)
    return out
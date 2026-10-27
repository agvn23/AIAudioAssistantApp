from __future__ import annotations

import math
import re
import subprocess
from typing import TypedDict

from .errors import AnalysisError


class _LoudnessRequired(TypedDict):
    integrated_lufs: float
    loudness_range_lu: float
    true_peak_dbtp: float


class LoudnessMetrics(_LoudnessRequired, total=False):
    """Matches the `loudness` section of schema/metrics.schema.json."""

    short_term_max_lufs: float
    momentary_max_lufs: float


_NUM = r"(-?\d+(?:\.\d+)?|-inf|nan)"
_INTEGRATED = re.compile(rf"^\s*I:\s+{_NUM}\s+LUFS", re.M)
_LRA = re.compile(rf"^\s*LRA:\s+{_NUM}\s+LU", re.M)
_PEAK = re.compile(rf"^\s*Peak:\s+{_NUM}\s+dBFS", re.M)
_FRAME = re.compile(rf"\bM:\s*{_NUM}\s+S:\s*{_NUM}")


def analyze_loudness(
    path: str, ffmpeg_path: str = "ffmpeg", timeout: float = 120
) -> LoudnessMetrics:
    """Measure EBU R128 loudness with ffmpeg's ebur128 filter (ITU-R BS.1770 based)."""
    args = [ffmpeg_path, "-hide_banner", "-nostats", "-i", path, "-vn",
            "-af", "ebur128=peak=true:framelog=info", "-f", "null", "-"]
    try:
        proc = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    except FileNotFoundError as exc:
        raise AnalysisError("ffmpeg_missing", f'ffmpeg not found at "{ffmpeg_path}"') from exc
    except subprocess.TimeoutExpired as exc:
        raise AnalysisError("ffmpeg_timeout", f"ffmpeg exceeded {timeout} s") from exc

    stderr = proc.stderr.decode("utf-8", "replace")
    if proc.returncode != 0:
        tail = "\n".join(stderr.strip().splitlines()[-5:])
        raise AnalysisError("ffmpeg_failed", f"ffmpeg exited with code {proc.returncode}:\n{tail}")
    return parse_ebur128_output(stderr)


def _num(raw: str | None) -> float | None:
    if raw is None:
        return None
    value = float(raw)
    return value if math.isfinite(value) else None


def parse_ebur128_output(stderr: str) -> LoudnessMetrics:
    """Parse the text the ebur128 filter writes to stderr."""
    idx = stderr.rfind("Summary:")
    if idx == -1:
        raise AnalysisError("parse_failed", "ebur128 summary not found in ffmpeg output")
    frames, summary = stderr[:idx], stderr[idx:]

    tp_idx = summary.find("True peak:")
    true_peak_section = summary[tp_idx:] if tp_idx != -1 else ""

    integrated_m = _INTEGRATED.search(summary)
    lra_m = _LRA.search(summary)
    peak_m = _PEAK.search(true_peak_section)
    if not (integrated_m and lra_m and peak_m):
        raise AnalysisError("parse_failed", "could not read loudness values from ffmpeg output")

    integrated = _num(integrated_m.group(1))
    if integrated is None:
        raise AnalysisError("silent", "audio is silent (no measurable loudness)")
    lra = _num(lra_m.group(1))
    peak = _num(peak_m.group(1))
    if lra is None or peak is None:
        raise AnalysisError("parse_failed", "unexpected non-numeric loudness values")

    # Frame lines look like "... M: -18.2 S: -20.3 I: -18.2 LUFS ...". Values at or below
    # -70 LUFS are under the absolute gate (ffmpeg shows -120.7 while a window is filling),
    # so they are ignored when taking the maxima.
    momentary: list[float] = []
    short_term: list[float] = []
    for m_raw, s_raw in _FRAME.findall(frames):
        m, s = _num(m_raw), _num(s_raw)
        if m is not None and m > -70:
            momentary.append(m)
        if s is not None and s > -70:
            short_term.append(s)

    result: LoudnessMetrics = {
        "integrated_lufs": integrated,
        "loudness_range_lu": lra,
        "true_peak_dbtp": peak,
    }
    if short_term:
        result["short_term_max_lufs"] = max(short_term)
    if momentary:
        result["momentary_max_lufs"] = max(momentary)
    return result

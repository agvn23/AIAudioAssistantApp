from __future__ import annotations


class AnalysisError(Exception):
    """Raised for any expected analysis failure. `code` is stable and safe to branch on.

    Codes: ffmpeg_missing, ffmpeg_failed, ffmpeg_timeout, empty_audio, parse_failed,
    silent, essentia_missing, ffprobe_missing, ffprobe_failed, no_audio_stream.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code

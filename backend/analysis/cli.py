"""Analyze one file and print the full metrics JSON.

Usage (from backend/):
    python -m analysis.cli ../samples/track.wav
    python -m analysis.cli ../samples/track.wav --genre house --platform spotify --stage mix
    python -m analysis.cli ../samples/track.wav --key-profile bgate
    python -m analysis.cli ../samples/track.wav --skip-tempo-key   # no essentia needed
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from .errors import AnalysisError
from .metrics import analyze_file


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Analyze an audio file.")
    parser.add_argument("file")
    parser.add_argument("--key-profile", default="edma",
                        choices=["edma", "edmm", "bgate", "temperley", "krumhansl"])
    parser.add_argument("--skip-tempo-key", action="store_true",
                        help="leave out BPM and key (no essentia needed; result will not "
                             "validate against the schema)")
    parser.add_argument("--genre")
    parser.add_argument("--platform", dest="target_platform",
                        choices=["spotify", "apple_music", "youtube", "club", "broadcast", "other"])
    parser.add_argument("--stage", choices=["demo", "mix", "master"])
    args = parser.parse_args(argv)

    context = {k: v for k, v in {"genre": args.genre, "target_platform": args.target_platform,
                                 "stage": args.stage}.items() if v}
    started = time.time()
    try:
        result = analyze_file(args.file, context=context or None,
                              include_tempo_key=not args.skip_tempo_key,
                              key_profile=args.key_profile)
    except AnalysisError as exc:
        print(f"error [{exc.code}]: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(result, indent=2))
    print(f"done in {time.time() - started:.1f} s", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

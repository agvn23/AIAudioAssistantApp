"""Compare AI feedback across models by hand. A developer tool: nothing in the app imports it.

It runs the same `generate_feedback` code the API uses, on a list of cases, and records for every
call which model was asked and which one answered (`model_version`), how many requests the call
used (2 means the citation check rejected the first answer), whether it ended in an error, and
the full text. It does not touch the database or the HTTP layer, so the per-user rate limit does
not apply, but every call spends real provider quota.

Run from backend/ with the venv active, for example:

    python -m scripts.compare_feedback --cases ../samples/feedback_compare/cases.json --runs 3

The cases file is a JSON list. Each case has a name and a metrics source (a stored metrics or
analysis JSON, or an audio file that is analysed once and cached), plus optional genre,
target_platform, stage and overrides (dotted path -> value, to try a situation without a new
upload):

    {"name": "demo-spotify", "metrics": "example_metrics.json", "genre": "pop rock",
     "target_platform": "spotify", "stage": "demo",
     "overrides": {"tempo.confidence": 0.1}}

Results go to the output folder (default ../samples/feedback_compare, which is git-ignored):
one JSON line per call (written as the calls finish, so a crash keeps what was done) and a
readable Markdown file.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter
from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.services.feedback.errors import FeedbackError
from app.services.feedback.service import MAX_ATTEMPTS, generate_feedback

ALLOWED_STAGES = ("demo", "mix", "master")
PROVIDER_CODES = frozenset({"not_configured", "timeout", "provider_error"})

_CASE_KEYS = frozenset({"name", "metrics", "genre", "target_platform", "stage", "overrides"})


# --- cases and metrics ---------------------------------------------------------------------


@dataclass(frozen=True)
class Case:
    name: str
    metrics: str  # path to a metrics/analysis JSON or an audio file, relative to the cases file
    genre: str | None = None
    target_platform: str | None = None
    stage: str | None = None
    overrides: dict[str, Any] = field(default_factory=dict)


def load_cases(path: Path) -> list[Case]:
    """Read and check a cases file. Raises ValueError with a message that names the case."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list) or not raw:
        raise ValueError("the cases file must hold a non-empty JSON list")

    cases: list[Case] = []
    names: set[str] = set()
    for index, entry in enumerate(raw, start=1):
        where = f"case {index}"
        if not isinstance(entry, dict):
            raise ValueError(f"{where}: must be an object")  # noqa: TRY004
        unknown = set(entry) - _CASE_KEYS
        if unknown:
            raise ValueError(f"{where}: unknown keys {sorted(unknown)}")

        name = entry.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"{where}: name must be a non-empty string")
        name = name.strip()
        if name in names:
            raise ValueError(f"{where}: duplicate name {name!r}")
        names.add(name)

        metrics = entry.get("metrics")
        if not isinstance(metrics, str) or not metrics.strip():
            raise ValueError(f"{where}: metrics must be a path (a JSON or an audio file)")

        stage = entry.get("stage")
        if stage is not None and stage not in ALLOWED_STAGES:
            raise ValueError(f"{where}: stage must be one of {', '.join(ALLOWED_STAGES)}")
        for key in ("genre", "target_platform"):
            if entry.get(key) is not None and not isinstance(entry[key], str):
                raise ValueError(f"{where}: {key} must be text")

        overrides = entry.get("overrides", {})
        if not isinstance(overrides, dict):
            raise ValueError(f"{where}: overrides must be an object of dotted path -> value")  # noqa: TRY004

        cases.append(
            Case(
                name=name,
                metrics=metrics.strip(),
                genre=entry.get("genre"),
                target_platform=entry.get("target_platform"),
                stage=stage,
                overrides=overrides,
            )
        )
    return cases


def apply_overrides(metrics: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    """Set dotted paths in `metrics` (in place) and return it. A list or value is replaced as
    a whole; a missing object on the way is created; a path that goes through anything other
    than an object (a list, a number) is an error."""
    for dotted, value in overrides.items():
        parts = dotted.split(".")
        if not all(parts):
            raise ValueError(f"bad override path {dotted!r}")
        node = metrics
        for part in parts[:-1]:
            child = node.get(part)
            if child is None:
                child = node[part] = {}
            if not isinstance(child, dict):
                raise ValueError(f"override {dotted!r}: {part!r} is not an object")  # noqa: TRY004
            node = child
        node[parts[-1]] = deepcopy(value)
    return metrics


def _analyze_audio(path: str) -> dict[str, Any]:
    # Imported here: analysing needs ffmpeg and essentia, which JSON-only runs do not.
    from analysis.errors import AnalysisError
    from analysis.metrics import analyze_file

    try:
        return analyze_file(path)
    except AnalysisError as exc:
        raise ValueError(f"analysing {path} failed: {exc}") from exc


def load_metrics(
    case: Case,
    *,
    base_dir: Path,
    cache_dir: Path,
    analyze: Callable[[str], dict[str, Any]] | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    """The metrics for a case, with its overrides applied to a copy.

    A .json source is read as raw metrics, or as an analysis export (an object whose "metrics"
    holds them). Anything else is treated as audio: it is analysed once and the result is cached
    in `cache_dir`, so every model sees exactly the same numbers. Use refresh=True after the
    analysis code changed."""
    source = base_dir / case.metrics
    if not source.is_file():
        raise FileNotFoundError(f"metrics source not found for case {case.name!r}: {source}")

    if source.suffix.lower() == ".json":
        data = json.loads(source.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("metrics"), dict):
            data = data["metrics"]
        if not isinstance(data, dict):
            raise ValueError(f"{source} does not hold a metrics object")
        metrics = data
    else:
        cache = cache_dir / f"{source.name}.metrics.json"
        if cache.is_file() and not refresh:
            metrics = json.loads(cache.read_text(encoding="utf-8"))
        else:
            metrics = (analyze or _analyze_audio)(str(source))
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    return apply_overrides(deepcopy(metrics), case.overrides)


# --- running one call ----------------------------------------------------------------------


class CountingGenerator:
    """Wraps a generator to count how many requests it makes. generate_feedback reads
    `model_name` and `last_model_version` from whatever it is given, so both are passed on."""

    def __init__(self, inner: Any) -> None:
        self._inner = inner
        self.calls = 0

    @property
    def model_name(self) -> str:
        return self._inner.model_name

    @property
    def last_model_version(self) -> str | None:
        return getattr(self._inner, "last_model_version", None)

    def generate(self, **kwargs: Any) -> str:
        self.calls += 1
        return self._inner.generate(**kwargs)


def run_case(
    generator: Any,
    case: Case,
    metrics: dict[str, Any],
    run_number: int,
    *,
    clock: Callable[[], float] = time.monotonic,
) -> dict[str, Any]:
    """One feedback call. Never raises for provider or output problems: they are recorded in
    `status` (ok, invalid_output, timeout, provider_error, not_configured)."""
    counter = CountingGenerator(generator)
    started = clock()
    feedback: dict[str, Any] | None = None
    status = "ok"
    try:
        feedback = generate_feedback(
            counter,
            metrics,
            genre=case.genre,
            target_platform=case.target_platform,
            stage=case.stage,
        )
    except FeedbackError as exc:
        status = exc.code
    seconds = round(clock() - started, 2)

    result: dict[str, Any] = {
        "case": case.name,
        "run": run_number,
        "status": status,
        "attempts": counter.calls,
        "model_asked": counter.model_name,
        "model_answered": counter.last_model_version,
        "seconds": seconds,
    }
    if feedback is not None:
        result["model_answered"] = feedback["meta"].get("model_version")
        result["feedback"] = feedback
    return result


# --- reading the results -------------------------------------------------------------------


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Counts for the decision rule. Provider failures (quota, timeout, overload) say nothing
    about the model's output, so they are counted apart and left out of `usable`: rerun them."""
    provider = [r for r in results if r["status"] in PROVIDER_CODES]
    ok = [r for r in results if r["status"] == "ok"]
    invalid = [r for r in results if r["status"] == "invalid_output"]
    retried = [r for r in ok if r["attempts"] > 1]
    invalid_per_case = Counter(r["case"] for r in invalid)
    return {
        "calls": len(results),
        "usable": len(results) - len(provider),
        "ok": len(ok),
        "ok_after_retry": len(retried),
        "invalid_output": len(invalid),
        "provider_failures": len(provider),
        "cases_with_repeated_invalid_output": sorted(
            name for name, count in invalid_per_case.items() if count >= 2
        ),
        "answered_by": dict(Counter(str(r.get("model_answered") or "unknown") for r in results)),
    }


def to_markdown(results: list[dict[str, Any]], *, model: str) -> str:
    """The calls as text to read and score by hand."""
    lines = [f"# Feedback comparison: {model}", ""]
    for result in results:
        lines.append(
            f"## {result['case']}, run {result['run']}: {result['status']}, "
            f"attempts {result['attempts']}, asked {result['model_asked']}, "
            f"answered by {result.get('model_answered') or 'unknown'}, {result['seconds']} s"
        )
        lines.append("")
        feedback = result.get("feedback")
        if feedback is None:
            lines += ["(no feedback: the call failed)", ""]
            continue
        lines += [f"Summary: {feedback['summary']}", ""]
        for item in feedback["items"]:
            lines.append(f"- [{item['priority']}] {item['area']}: {item['observation']}")
            lines.append(f"  Suggestion: {item['suggestion']}")
            cited = ", ".join(f"{e['metric']} = {e['value']}" for e in item["evidence"])
            lines.append(f"  Evidence: {cited}")
        for caveat in feedback["caveats"]:
            lines.append(f"- Caveat: {caveat}")
        lines.append("")
    return "\n".join(lines)


# --- command line --------------------------------------------------------------------------


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run feedback cases against one model and record how it did."
    )
    parser.add_argument("--cases", required=True, help="path to the cases JSON file")
    parser.add_argument("--model", help="model name to ask; default: GEMINI_MODEL from .env")
    parser.add_argument("--runs", type=int, default=1, help="runs per case (default 1)")
    parser.add_argument(
        "--pause", type=float, default=0.0, help="seconds to wait between calls (default 0)"
    )
    parser.add_argument(
        "--out", default="../samples/feedback_compare", help="output folder (git-ignored)"
    )
    parser.add_argument(
        "--refresh", action="store_true", help="analyse audio sources again instead of the cache"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.runs < 1 or args.pause < 0:
        print("error: --runs must be at least 1 and --pause cannot be negative", file=sys.stderr)
        return 2

    from app.config import settings
    from app.services.feedback.generators import build_generator

    cases_path = Path(args.cases)
    out_dir = Path(args.out)
    try:
        cases = load_cases(cases_path)
        loaded = [
            (
                case,
                load_metrics(
                    case,
                    base_dir=cases_path.parent,
                    cache_dir=out_dir / "metrics",
                    refresh=args.refresh,
                ),
            )
            for case in cases
        ]
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    model = (args.model or settings.gemini_model or "").strip()
    if not model:
        print("error: no model: pass --model or set GEMINI_MODEL", file=sys.stderr)
        return 2
    try:
        generator = build_generator(settings.model_copy(update={"gemini_model": model}))
    except FeedbackError as exc:
        print(f"error: {exc.code}: {exc.message}", file=sys.stderr)
        return 2

    total = len(loaded) * args.runs
    print(
        f"{total} calls on {model}, at most {total * MAX_ATTEMPTS} provider requests "
        f"(a call uses 2 when the citation check rejects the first answer)"
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    base = f"{re.sub(r'[^A-Za-z0-9._-]+', '_', model)}-{stamp}"
    jsonl = out_dir / f"{base}.jsonl"

    results: list[dict[str, Any]] = []
    for case, metrics in loaded:
        for run_number in range(1, args.runs + 1):
            if results and args.pause:
                time.sleep(args.pause)
            result = run_case(generator, case, metrics, run_number)
            results.append(result)
            with jsonl.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(result) + "\n")
            print(
                f"[{len(results)}/{total}] {case.name} run {run_number}: {result['status']}, "
                f"attempts {result['attempts']}, answered by "
                f"{result['model_answered'] or 'unknown'}, {result['seconds']} s"
            )

    (out_dir / f"{base}.md").write_text(to_markdown(results, model=model), encoding="utf-8")
    print(json.dumps(summarize(results), indent=2))
    print(f"results: {out_dir / base}.jsonl and .md")
    return 0


if __name__ == "__main__":
    sys.exit(main())

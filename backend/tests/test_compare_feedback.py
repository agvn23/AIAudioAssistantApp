import json

import pytest
from feedback_fakes import FakeGenerator, example_metrics, good_output

from app.services.feedback.errors import FeedbackError
from scripts import compare_feedback as cf


class VersionedGenerator(FakeGenerator):
    """Like GeminiGenerator: `last_model_version` is cleared at the start of every call and set
    again after a call that returned an answer. `versions` holds one value per answer."""

    def __init__(self, *outputs, versions):
        super().__init__(*outputs)
        self.versions = list(versions)
        self.last_model_version = None

    def generate(self, **kwargs):
        self.last_model_version = None
        result = super().generate(**kwargs)
        self.last_model_version = self.versions.pop(0)
        return result


def case(**overrides):
    fields = {
        "name": "demo",
        "metrics": "x.json",
        "genre": "pop rock",
        "target_platform": "spotify",
        "stage": "demo",
    }
    fields.update(overrides)
    return cf.Case(**fields)


def write_json(path, data):
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


# --- cases file ----------------------------------------------------------------------------


def test_load_cases_reads_the_fields(tmp_path):
    path = write_json(
        tmp_path / "cases.json",
        [
            {
                "name": " a ",
                "metrics": "a.json",
                "genre": "house",
                "target_platform": "club",
                "stage": "master",
                "overrides": {"tempo.confidence": 0.1},
            },
            {"name": "b", "metrics": "b.wav"},
        ],
    )
    first, second = cf.load_cases(path)

    assert first == cf.Case(
        name="a",
        metrics="a.json",
        genre="house",
        target_platform="club",
        stage="master",
        overrides={"tempo.confidence": 0.1},
    )
    assert second.genre is None and second.stage is None and second.overrides == {}


@pytest.mark.parametrize(
    ("content", "fragment"),
    [
        ({}, "non-empty"),
        ([], "non-empty"),
        ([{"metrics": "a.json"}], "name must"),
        ([{"name": "a"}], "metrics must"),
        ([{"name": "a", "metrics": "a.json", "stage": "final"}], "stage must"),
        ([{"name": "a", "metrics": "a.json", "colour": "red"}], "unknown"),
        (
            [{"name": "a", "metrics": "a.json"}, {"name": "a", "metrics": "b.json"}],
            "duplicate",
        ),
        ([{"name": "a", "metrics": "a.json", "overrides": [1]}], "overrides must"),
    ],
)
def test_load_cases_rejects_bad_files(tmp_path, content, fragment):
    path = write_json(tmp_path / "cases.json", content)
    with pytest.raises(ValueError, match=fragment):
        cf.load_cases(path)


# --- overrides -----------------------------------------------------------------------------


def test_apply_overrides_sets_nested_values_and_replaces_lists():
    metrics = example_metrics()
    warning = {"code": "true_peak_above_0dbtp", "message": "true peak is 1.20 dBTP"}

    result = cf.apply_overrides(
        metrics,
        {"tempo.confidence": 0.1, "warnings": [warning], "extra.section.value": 3},
    )

    assert result is metrics
    assert metrics["tempo"]["confidence"] == 0.1
    assert metrics["warnings"] == [warning]
    assert metrics["extra"] == {"section": {"value": 3}}


def test_apply_overrides_refuses_to_go_through_a_non_object():
    # spectrum.bands is a list in the stored metrics
    with pytest.raises(ValueError, match="not an object"):
        cf.apply_overrides(example_metrics(), {"spectrum.bands.sub.relative_db": 1.0})


# --- loading metrics -----------------------------------------------------------------------


def test_load_metrics_reads_raw_metrics_and_analysis_exports(tmp_path):
    metrics = example_metrics()
    write_json(tmp_path / "raw.json", metrics)
    write_json(tmp_path / "export.json", {"id": 5, "status": "done", "metrics": metrics})

    for name in ("raw.json", "export.json"):
        loaded = cf.load_metrics(
            case(metrics=name), base_dir=tmp_path, cache_dir=tmp_path / "cache"
        )
        assert loaded == metrics


def test_overrides_do_not_leak_between_loads(tmp_path):
    metrics = example_metrics()
    write_json(tmp_path / "raw.json", metrics)
    cache = tmp_path / "cache"

    changed = cf.load_metrics(
        case(metrics="raw.json", overrides={"tempo.confidence": 0.1}),
        base_dir=tmp_path,
        cache_dir=cache,
    )
    plain = cf.load_metrics(case(metrics="raw.json"), base_dir=tmp_path, cache_dir=cache)

    assert changed["tempo"]["confidence"] == 0.1
    assert plain["tempo"]["confidence"] == metrics["tempo"]["confidence"]


def test_audio_is_analysed_once_and_then_cached(tmp_path):
    (tmp_path / "track.wav").write_bytes(b"not really audio")
    cache = tmp_path / "cache"
    calls = []

    def fake_analyze(path):
        calls.append(path)
        return {"loudness": {"true_peak_dbtp": 1.0}}

    def load(**kwargs):
        return cf.load_metrics(
            case(metrics="track.wav"),
            base_dir=tmp_path,
            cache_dir=cache,
            analyze=fake_analyze,
            **kwargs,
        )

    assert load() == {"loudness": {"true_peak_dbtp": 1.0}}
    assert load() == {"loudness": {"true_peak_dbtp": 1.0}}
    assert len(calls) == 1
    assert (cache / "track.wav.metrics.json").is_file()

    load(refresh=True)
    assert len(calls) == 2


def test_a_missing_metrics_file_is_reported(tmp_path):
    with pytest.raises(FileNotFoundError, match="demo"):
        cf.load_metrics(case(), base_dir=tmp_path, cache_dir=tmp_path / "cache")


# --- running one call ----------------------------------------------------------------------


def test_counting_generator_counts_calls_and_reports_the_version():
    inner = VersionedGenerator("a", "b", versions=["v1", "v2"])
    counter = cf.CountingGenerator(inner)
    assert counter.model_name == "fake-model"
    assert counter.last_model_version is None

    counter.generate(system_prompt="s", user_message="u", json_schema={})
    counter.generate(system_prompt="s", user_message="u", json_schema={})

    assert counter.calls == 2
    assert counter.last_model_version == "v2"
    # a generator that has no last_model_version at all gives None
    assert cf.CountingGenerator(FakeGenerator("a")).last_model_version is None


def test_a_clean_run_is_ok_with_one_attempt():
    generator = VersionedGenerator(good_output(), versions=["fake-model-001"])

    result = cf.run_case(
        generator, case(), example_metrics(), 1, clock=iter([10.0, 12.5]).__next__
    )

    assert result["status"] == "ok"
    assert result["attempts"] == 1
    assert result["model_asked"] == "fake-model"
    assert result["model_answered"] == "fake-model-001"
    assert result["seconds"] == 2.5
    assert result["feedback"]["items"]
    json.dumps(result)  # the result is written as a JSON line


def test_a_rejected_first_answer_counts_two_attempts():
    generator = VersionedGenerator("not json", good_output(), versions=["v-first", "v-second"])

    result = cf.run_case(generator, case(), example_metrics(), 2)

    assert result["status"] == "ok"
    assert result["attempts"] == 2
    assert result["run"] == 2
    assert result["model_answered"] == "v-second"


def test_invalid_output_is_recorded_with_its_attempts():
    result = cf.run_case(FakeGenerator("nope", "still nope"), case(), example_metrics(), 1)

    assert result["status"] == "invalid_output"
    assert result["attempts"] == 2
    assert "feedback" not in result


def test_a_provider_error_is_recorded():
    generator = FakeGenerator(FeedbackError("timeout", "slow"))

    result = cf.run_case(generator, case(), example_metrics(), 1)

    assert result["status"] == "timeout"
    assert result["attempts"] == 1
    assert result["model_answered"] is None


# --- reading the results -------------------------------------------------------------------


def test_summarize_counts_retries_failures_and_models():
    def result(name, status, attempts, answered):
        return {
            "case": name,
            "run": 1,
            "status": status,
            "attempts": attempts,
            "model_answered": answered,
        }

    results = [
        result("a", "ok", 1, "m-1"),
        result("a", "ok", 2, "m-1"),
        result("b", "invalid_output", 2, "m-2"),
        result("b", "invalid_output", 2, "m-2"),
        result("c", "invalid_output", 2, "m-2"),
        result("d", "provider_error", 1, None),
    ]

    assert cf.summarize(results) == {
        "calls": 6,
        "usable": 5,
        "ok": 2,
        "ok_after_retry": 1,
        "invalid_output": 3,
        "provider_failures": 1,
        "cases_with_repeated_invalid_output": ["b"],
        "answered_by": {"m-1": 2, "m-2": 3, "unknown": 1},
    }


def test_markdown_lists_every_call_with_its_text():
    ok = cf.run_case(
        VersionedGenerator(good_output(), versions=["fake-model-001"]),
        case(),
        example_metrics(),
        1,
    )
    failed = cf.run_case(FakeGenerator("nope", "nope"), case(name="other"), example_metrics(), 1)

    text = cf.to_markdown([ok, failed], model="fake-model")

    assert text.startswith("# Feedback comparison: fake-model")
    assert "## demo, run 1: ok, attempts 1" in text
    assert "answered by fake-model-001" in text
    assert "True peak is above 0 dBTP." in text
    assert "loudness.true_peak_dbtp = 1.2" in text
    assert "## other, run 1: invalid_output, attempts 2" in text
    assert "(no feedback: the call failed)" in text

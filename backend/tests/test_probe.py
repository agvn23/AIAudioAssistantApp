import json
from types import SimpleNamespace

from analysis import probe

FFPROBE_ENTRIES = (
    "stream=sample_rate,channels,bits_per_raw_sample,bits_per_sample:format=duration,format_name"
)


def _fake_run(seen, payload):
    def run(args, **kwargs):
        seen["args"] = args
        seen["kwargs"] = kwargs
        return SimpleNamespace(returncode=0, stdout=json.dumps(payload).encode(), stderr=b"")

    return run


def test_ffprobe_gets_this_exact_argument_list(monkeypatch):
    seen = {}
    monkeypatch.setattr(probe.subprocess, "run", _fake_run(seen, {"streams": [{}], "format": {}}))

    probe.probe_file("song.wav")

    assert seen["args"] == [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        FFPROBE_ENTRIES,
        "-of",
        "json",
        "song.wav",
    ]
    assert not seen["kwargs"].get("shell")


def test_stream_facts_are_read_from_the_ffprobe_json(monkeypatch):
    payload = {
        "streams": [{"sample_rate": "44100", "channels": 2, "bits_per_raw_sample": "24"}],
        "format": {"duration": "1.5", "format_name": "wav"},
    }
    monkeypatch.setattr(probe.subprocess, "run", _fake_run({}, payload))

    assert probe.probe_file("song.wav") == {
        "sample_rate_hz": 44100,
        "channels": 2,
        "bit_depth": 24,
        "duration_sec": 1.5,
        "format_name": "wav",
    }

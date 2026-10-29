# AI Audio Assistant for Producers

Web app where a producer uploads a track, gets measured audio metrics, and receives AI-written, actionable feedback. Final bootcamp project and portfolio piece aimed at audio AI / plugin work, so correct, explainable audio measurements matter more than flashy features.

## Core principle
Measure with DSP, explain with the LLM. The LLM only receives the metrics JSON (see `schema/metrics.schema.json`) plus the user's context (genre, target platform, stage). It never "listens" to audio and must not invent measurements.

## Stack
- Frontend: React + TypeScript (Vite), wavesurfer.js for waveforms
- API: FastAPI (Python)
- Analysis: Python package in `backend/analysis/`
  - Loudness (LUFS, LRA, true peak): ffmpeg `ebur128` filter via subprocess
  - BPM and key: essentia (native Python), audio decoded by ffmpeg to mono float32 at 44.1 kHz
  - Spectrum bands, dynamics, stereo: numpy/scipy (see `docs/DECISIONS.md` for how each value is defined)
- LLM: Anthropic API, structured JSON output
- Data: SQLAlchemy 2.0 + Pydantic v2 + Alembic, SQLite to start (Postgres later if needed). Auth: email + password (Argon2) with JWT bearer tokens. Uploaded audio is a temporary file deleted after analysis; only the metrics JSON is stored. Full plan in `docs/API.md`
- Platform note: `pip install essentia` works on Linux and macOS; on Windows use WSL.

## Layout
```
backend/
  analysis/        pure measurement functions (one module per metric group) + cli.py
  app/             FastAPI app (routes, models, services)
  tests/
  requirements.txt, requirements-dev.txt, pyproject.toml
frontend/          React + TypeScript
schema/            metrics.schema.json
samples/           your own tracks for manual testing (git-ignored, never committed)
docs/DECISIONS.md  decision log
```

## Commands (from `backend/`)
- Setup: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt`
- Analyze one file: `python -m analysis.cli ../samples/<file>.wav` (optional `--genre`, `--platform`, `--stage`; `--skip-tempo-key` skips essentia)
- Config: `cp .env.example .env` and set `JWT_SECRET` (generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`)
- API: `uvicorn app.main:app --reload` (interactive docs at http://127.0.0.1:8000/docs)
- Tests: `pytest`
- Lint/format: `ruff check . && ruff format .`
- Requires `ffmpeg` on PATH.

## Conventions
- Python 3.12, type hints everywhere, ruff for lint and format.
- Analysis code is pure and framework-free: file path or array in, plain dict out. It must not import FastAPI. This keeps it portable (a later C++/JUCE plugin could reimplement the same measurements against the same schema).
- Every analysis result must validate against `schema/metrics.schema.json`; add a test for that (jsonschema is in the dev requirements).
- Raise `AnalysisError(code, message)` for expected failures; the API maps codes to HTTP errors.
- Call ffmpeg with `subprocess.run([...])` and a list of arguments, never `shell=True`.
- Key and BPM are suggestions: always report confidence, never a bare value.
- Work one slice at a time on a feature branch; keep each slice small and verified before the next.
- Uploaded audio is deleted after analysis unless the user saves the track. Do not log file contents.

## Current slice (update as you go)
Week 1 (analysis engine) is complete: `analysis/metrics.py` (`analyze_file`) assembles the full metrics JSON and the CLI prints it. First real-track essentia check: BPM 123.7 vs actual 124, key matched; more tracks still to test, and loudness/DR/spectrum should be spot-checked against a meter you trust.
Week 2, slice 1 (config, database, users, auth) is done and verified: pytest green, `/docs` and `/users/me` work. Code is in `backend/app/`, tests in `tests/test_auth.py` and `tests/test_tokens.py`.
- Next: slice 2 (Track and Tag CRUD with the ownership rules) from `docs/API.md`, on a branch `feature/tracks` created from `dev`.

## Plan
1. Analysis engine + metrics JSON (this slice)
2. FastAPI API: accounts and tokens, Track/Tag/Analysis CRUD, upload + analysis, LLM feedback (see `docs/API.md`; one slice at a time)
3. React UI: upload, waveform, results cards, track list with edit/delete, optional follow-up chat
4. Hardening: retention/deletion, validation and errors, deployment, README

## Out of scope for now
DAW plugin, audio generation or stem separation, sample-library search.

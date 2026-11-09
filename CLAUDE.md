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
- LLM: Gemini free tier (google-genai) behind a FeedbackGenerator interface in app/services/feedback/, structured JSON output
- Data: SQLAlchemy 2.0 + Pydantic v2 + Alembic, SQLite to start (Postgres later if needed). Auth: email + password (Argon2) with JWT bearer tokens. Uploaded audio is a temporary file deleted after analysis; only the metrics JSON is stored. Full plan in `docs/API.md`
- Platform note: `pip install essentia` works on Linux and macOS; on Windows use WSL.

## Layout
```
README.md          portfolio README (setup, env vars, architecture)
backend/
  analysis/        pure measurement functions (one module per metric group) + cli.py
  app/             FastAPI app: routers/, services/, models, schemas, config, db,
                   error_handling, request_limits, rate_limit, security, deps
  alembic/         migrations (versions/)
  tests/
  alembic.ini, requirements.txt, requirements-dev.txt, pyproject.toml, .env.example
frontend/          React + TypeScript
schema/            metrics.schema.json
samples/           your own tracks for manual testing (git-ignored, never committed)
docs/API.md        the API and data model as built
docs/DECISIONS.md  decision log
```

## Commands (from `backend/`)
- Setup: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt`
- Config: `cp .env.example .env` and set `JWT_SECRET` (generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`)
- Database: `alembic upgrade head` (creates and updates the tables; the app does not create them). After changing a model: `alembic revision --autogenerate -m "short description"`, review the file, then `alembic upgrade head`
- Analyze one file: `python -m analysis.cli ../samples/<file>.wav` (optional `--genre`, `--platform`, `--stage`; `--skip-tempo-key` skips essentia)
- API: `uvicorn app.main:app --reload` (interactive docs at http://127.0.0.1:8000/docs)
- Tests: `pytest`
- Lint/format: `ruff check . && ruff format .`
- Requires `ffmpeg` on PATH.

## Conventions
- Python 3.12 or newer (developed on 3.14), type hints everywhere, ruff for lint and format.
- Analysis code is pure and framework-free: file path or array in, plain dict out. It must not import FastAPI. This keeps it portable (a later C++/JUCE plugin could reimplement the same measurements against the same schema).
- Every analysis result must validate against `schema/metrics.schema.json`; add a test for that (jsonschema is in the dev requirements).
- Raise `AnalysisError(code, message)` for expected failures; the API maps codes to HTTP errors.
- API errors: raise `HTTPException`, or `ApiError(status, message, code=...)` when the status alone is not enough. Every error response uses the one envelope `{"error": {"code", "message"}}`; never return a raw stack trace. Frontend code branches on `code`, not on the message.
- Every resource query is filtered by the current user; someone else's resource is a 404, never a 403.
- Changing a model means writing a migration; `tests/test_migrations.py` fails when the models and the migrations disagree.
- Limits (rate limits, quotas, body sizes, concurrency) are settings in `app/config.py`, documented in `.env.example`; do not hard-code numbers in routes.
- Call ffmpeg with `subprocess.run([...])` and a list of arguments, never `shell=True`.
- Key and BPM are suggestions: always report confidence, never a bare value.
- Work one slice at a time on a feature branch; keep each slice small and verified before the next. Slices are built in Claude chat: whole files plus tests, run locally.
- Uploaded audio is deleted after analysis unless the user saves the track. Do not log file contents.

## Current slice (update as you go)
Week 1 (analysis engine) is complete: `analysis/metrics.py` (`analyze_file`) assembles the full metrics JSON and the CLI prints it. Loudness, LRA and true peak are verified against Youlean, the DAW meter, SPAN and WLM on one track. Still open: spectrum bands, stereo width/correlation and RMS are not yet spot-checked against a meter; tempo/key reliability thresholds are calibrated on one track (two checked in total).
Week 2 (API) is complete: slices 1-5 done (config/db/auth, tracks and tags, upload and analysis, AI feedback, hardening with account deletion, error envelope, CORS, limits, rate limits, Alembic, README). 373 tests passing, 1 skipped (an opt-in live test).
Week 3 (frontend), slice 0 is done and merged: Vite + React + strict TypeScript 5.9 in frontend/, Vitest + React Testing Library + MSW 2, Prettier, typed client generated from schema/openapi.json (npm run api:types), ApiError normalisation, sessionStorage token store, router shell and a throwaway health page. 26 tests passing. 
Week 3 (frontend): slice 0 done. Slice 1 (auth) done and merged: login, register (auto sign-in), route guard, session-expiry handling, account page with delete-account dialog, shared form components. NNN tests passing.
Next: slice 2 (tracks). Slices: 2 tracks, 3 upload + polling, 4 results, 5 polish + docs.

## Plan
1. Analysis engine + metrics JSON (done)
2. FastAPI API: accounts and tokens, Track/Tag/Analysis CRUD, upload + analysis, LLM feedback, hardening (done; see `docs/API.md`)
3. React UI: upload, waveform, results cards, track list with edit/delete, optional follow-up chat
4. Final hardening and polish: deployment notes, README screenshots, calibration of the open measurement checks

## Out of scope for now
DAW plugin, audio generation or stem separation, sample-library search.

# AI Audio Assistant for Producers

Web app where a producer uploads a track, gets measured audio metrics, and receives AI-written, actionable feedback. Final bootcamp project and portfolio piece aimed at audio AI / plugin work, so correct, explainable audio measurements matter more than flashy features.

## Core principle
Measure with DSP, explain with the LLM. The LLM only receives the metrics JSON (see `schema/metrics.schema.json`) plus the user's context (genre, target platform, stage). It never "listens" to audio and must not invent measurements.

## Stack
- Frontend: React + TypeScript (Vite, strict, TypeScript pinned to ~5.9), React Router, TanStack Query 5, react-hook-form (no zod), openapi-fetch with types generated from `schema/openapi.json`, CSS Modules, wavesurfer.js for waveforms. Tests: Vitest, React Testing Library, MSW 2, vitest-axe
- API: FastAPI (Python)
- Analysis: Python package in `backend/analysis/`
  - Loudness (LUFS, LRA, true peak): ffmpeg `ebur128` filter via subprocess
  - BPM and key: essentia (native Python), audio decoded by ffmpeg to mono float32 at 44.1 kHz
  - Spectrum bands, dynamics, stereo: numpy/scipy (see `docs/DECISIONS.md` for how each value is defined)
- LLM: Gemini free tier (google-genai, model `gemini-3.5-flash-lite`; the free-tier limits are small and change, see `docs/DECISIONS.md`) behind a FeedbackGenerator interface in app/services/feedback/, structured JSON output
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
  scripts/         developer tools, not part of the app (compare_feedback.py)
  tests/
  alembic.ini, requirements.txt, requirements-dev.txt, pyproject.toml, .env.example
frontend/          React + TypeScript (Vite); tests live next to the code
schema/            metrics.schema.json, openapi.json (the API contract the frontend types are generated from)
samples/           your own tracks for manual testing (git-ignored, never committed)
docs/API.md        the API and data model as built
docs/DECISIONS.md  decision log
```
Real test samples for the frontend stay in `frontend/src/test/fixtures/private/` (git-ignored, as is `*.wav`).

## Commands (from `backend/`)
- Setup: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt`
- Config: `cp .env.example .env` and set `JWT_SECRET` (generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`)
- Database: `alembic upgrade head` (creates and updates the tables; the app does not create them). After changing a model: `alembic revision --autogenerate -m "short description"`, review the file, then `alembic upgrade head`
- Analyze one file: `python -m analysis.cli ../samples/<file>.wav` (optional `--genre`, `--platform`, `--stage`; `--skip-tempo-key` skips essentia)
- API: `uvicorn app.main:app --reload` (interactive docs at http://127.0.0.1:8000/docs)
- Tests: `pytest`
- Live test against the real provider (opt-in, spends Gemini quota): `RUN_LIVE_TESTS=1 pytest tests/test_feedback_live.py -s -rs`
- Compare feedback across models (spends Gemini quota): `python -u -m scripts.compare_feedback --cases ../samples/feedback_compare/cases.json --runs 3 --pause 8` (optional `--model`); cases and results live in `samples/feedback_compare/` (git-ignored). How the results were judged is in `docs/DECISIONS.md` (2026-11-16 and 2026-11-17 rows)
- Lint/format: `ruff check . && ruff format --check .` (`ruff format .` writes). Both are clean since the lint baseline of 2026-11-19. `pyproject.toml` sets no rule list, so the rules are the defaults of ruff 0.17.3, which `requirements-dev.txt` pins; upgrade it on purpose (see `docs/DECISIONS.md`, 2026-11-19 rows)
- Requires `ffmpeg` on PATH.

## Commands (from `frontend/`; check `pwd` first, because the repo root and its parents have their own package.json files)
- Install: `npm install` (Node 22 or newer)
- Dev server: `npm run dev` (http://localhost:5173; the port is fixed because the API's CORS list names it)
- Tests: `npm test` (Vitest, runs once; `npm run test:watch` for watch mode)
- Checks: `npm run typecheck`, `npm run lint`, `npm run format:check` (`npm run format` writes), `npm run build`
- API types: `npm run api:types` regenerates `src/api/schema.d.ts` from `../schema/openapi.json`. There is no script yet that dumps `openapi.json` from the backend (listed as open in `docs/DECISIONS.md`)
- Audit: `npm audit --omit=dev` (dev-only findings are reviewed in `docs/DECISIONS.md`)
- Config: `VITE_MAX_UPLOAD_MB` (default 100) is the size the upload dialog checks before sending; keep it in step with the backend's `MAX_UPLOAD_MB`. The API address and CORS: set `CORS_ORIGINS` in `backend/.env` to the frontend's address outside development.

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

## Frontend conventions
- `docs/API.md` and `schema/openapi.json` are the contract. HTTP failures become an `ApiError` in one place (`src/api/client.ts`); callers branch on `error.code`, never on the message.
- Field limits come from `openapi.json`, are counted in characters after trimming, and use no native `maxLength` (a native limit would silently cut pasted text).
- The `metrics` and `feedback` objects are parsed at runtime by strict parsers; a wrong required part gives `null`.
- Styling: CSS Modules with tokens from `index.css`. The dark tokens exist twice (the system preference and the `data-theme` override) and `tokens.test.ts` fails if they differ. The theme choice is stored under `aaa.theme`; an inline script in `index.html` applies it before first paint and `noFlash.test.ts` keeps it in step.
- Dialogs are native `<dialog>`. Forms use react-hook-form.
- Tests: `onUnhandledRequest` is `'error'` in MSW, so a page that gains a request needs handlers in every existing test that renders it. vitest-axe runs with `color-contrast` and `region` disabled (jsdom has no layout); contrast is checked by calculation. Vitest turns CSS imports into an empty string, so a test that must read a file uses `node:fs` with `process.cwd()` in the default jsdom environment. Module mocks use `vi.hoisted`.
- Lint: the react-hooks rules are strict (no reading refs during render, no setState in effects), and unused imports fail typecheck and lint.
- Never use `--force` or `--legacy-peer-deps`. If versions conflict, show them and choose a fix together.

## Current slice (update as you go)
Week 1 (analysis engine) is complete: `analysis/metrics.py` (`analyze_file`) assembles the full metrics JSON and the CLI prints it. Loudness, LRA and true peak are verified against Youlean, the DAW meter, SPAN and WLM on one track. RMS is checked (equal to ffmpeg's astats on one track, within 0.6 dB of SPAN on three). Still open: spectrum bands and stereo width/correlation are not yet spot-checked against a meter (procedures in `docs/DECISIONS.md`); tempo/key reliability thresholds are calibrated on one track (two checked in total).
Week 2 (API) is complete: slices 1-5 done (config/db/auth, tracks and tags, upload and analysis, AI feedback, hardening with account deletion, error envelope, CORS, limits, rate limits, Alembic, README). 373 tests passing, 1 skipped (an opt-in live test).
Week 3 (frontend): slices 0 to 4 are done and merged into dev.
- Slice 0: Vite + React + strict TypeScript, Vitest + Testing Library + MSW 2, typed client generated from `schema/openapi.json`, `ApiError` normalisation, sessionStorage token store, router shell.
- Slice 1 (auth): login, register (auto sign-in), route guard, session-expiry handling, account page with delete-account dialog, shared form components.
- Slice 2 (tracks): `/tracks` list with URL-driven search, genre, tag and paging, tag chips, create/edit/delete dialogs, `/tracks/:id` detail page.
- Slice 3 (upload and polling, PR #10): XHR upload with progress and validation, version list with polling, `/analyses/:id` version page (status, edit, delete), waveform from the local file in-session only.
- Slice 4 (results): runtime parsers for metrics and feedback, metrics cards, hand-written SVG spectrum chart with a hidden table, feedback cards with generate and regenerate.
Week 3 (frontend): slice 5 (polish) is merged into dev (PR #12). It adds the theme switch (system, light, dark), a repainting waveform with a keyboard position slider, "choose the audio file again", a contrast review, shared helpers, the label limit, the feedback rate-limit countdown and stale-feedback hint for genre and platform, and the `npm audit` and `allowScripts` review. 79 test files, 821 tests passing; typecheck, lint, format:check and build are clean; `npm audit --omit=dev` reports 0 vulnerabilities. Manual checks passed: upload end to end, dialogs, a 100 MB waveform, the AIFF message, an OS theme switch, narrow rows and paging. VoiceOver is checked on the Tracks page only. The decisions are in `docs/DECISIONS.md`.
Backend slice 6 (follow-ups, branch `backend/slice-6-followups`, built in Claude chat) is merged into dev: `meta.model_version` is stored with the feedback; a `true_peak_above_0dbtp` warning covers inter-sample overs; `scripts/compare_feedback.py` compares models and was used to keep `gemini-3.5-flash-lite` (the older flash timed out at 60 s in 2 of 5 calls); feedback prompt rules 6 to 8 were tightened and re-run; a provider 503 is retried up to twice (2 s, then 4 s); the ignored `temperature` is no longer sent. 450 backend tests passed, 1 skipped (the opt-in live test), at the end of the slice. Known weaknesses of the feedback: "nothing needs fixing" boilerplate, few dynamics findings, less specific than `gemini-3.5-flash`; about a quarter of provider calls failed with a 503 in the comparison runs. Numbers and reasons are in `docs/DECISIONS.md` (rows from 2026-11-15 to 2026-11-17).
Backend lint baseline (branch `backend/lint-baseline`, built in Claude chat) is done and waits for its pull request into dev: `ruff check .` and `ruff format --check .` pass in `backend/` (27 findings fixed, 40 files reformatted) with no change in behaviour, and ruff is pinned to 0.17.3. Each fix that touches behaviour got a test that also passes on the old code, and the formatting commit was checked by comparing syntax trees with the commit before it. 468 backend tests pass, 1 skipped. The judgement calls are in `docs/DECISIONS.md` (2026-11-19 rows).
Next after that: open the pull request for the lint baseline; then the open checks in `docs/DECISIONS.md` (VoiceOver on the remaining pages, the unexplained "clickable" report), spectrum and stereo against a meter, more tempo and key tracks, a recheck of `npm audit` and of the Gemini free-tier numbers before submission, deployment notes and README screenshots.

## Plan
1. Analysis engine + metrics JSON (done)
2. FastAPI API: accounts and tokens, Track/Tag/Analysis CRUD, upload + analysis, LLM feedback, hardening (done; see `docs/API.md`)
3. React UI: upload, waveform, results cards, track list with edit/delete (done in slices 0 to 5; the optional follow-up chat is not built)
4. Final hardening and polish: deployment notes, README screenshots, calibration of the open measurement checks (in progress)

## Out of scope for now
DAW plugin, audio generation or stem separation, sample-library search.

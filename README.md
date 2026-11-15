# AI Audio Assistant for Producers

Upload a track, get **measured** audio metrics, and receive **AI-written, actionable feedback** that is checked against those measurements before you see it.

This is my final bootcamp project and a portfolio piece aimed at audio AI and plugin work. Correct, explainable audio measurements matter more here than flashy features, so the design starts from one rule.

## The idea: measure with DSP, explain with the LLM

The language model never "listens" to audio and is never trusted with numbers.

```mermaid
flowchart LR
    A[Upload audio] --> B["Measure<br/>ffmpeg, numpy/scipy, essentia"]
    B --> C["Metrics JSON<br/>validated against a schema"]
    C --> D["LLM feedback<br/>metrics + genre, platform, stage only"]
    D --> E["Evidence check<br/>every cited number verified in code"]
    E --> F["Prioritised, actionable feedback"]
```

- **Measurement is deterministic DSP.** Loudness, dynamics, spectrum, stereo, tempo and key are computed by code I can test and compare against meters I trust.
- **The LLM only explains.** It receives the metrics JSON plus the track's genre, target platform and stage, and nothing else: not the audio, not the file name, not free-text notes.
- **Every claim is verified.** Each feedback item cites a metric by path and value. The server checks those citations against the stored metrics, retries once if they are wrong, and otherwise refuses to return the feedback (502) instead of showing invented numbers.
- **Uncertain measurements stay uncertain.** Tempo and key are suggestions that always carry a confidence value. When confidence is low, the related feedback is clamped to low priority.

## What it does

- Accounts with email and password, and token authentication.
- Tracks with title, genre, target platform, notes and tags, with full create, read, update and delete, and a searchable, filterable, paged list.
- One **analysis per uploaded version** of a track (demo, mix or master), so versions can be compared over time.
- Upload with a progress bar, then background analysis with a status that the page polls (`pending`, `running`, `done`, `failed`).
- A version page with the measurements as cards, a spectrum chart, and a waveform drawn from the file you chose, in your browser only.
- AI feedback on any finished analysis, generated on demand, with the cited numbers shown next to each suggestion.
- A light, dark or system theme.
- The uploaded audio is a temporary file that is **deleted as soon as analysis finishes**. Only the metrics JSON is stored.

## Screenshots

Each screenshot follows your theme: GitHub shows the dark version to viewers on a dark theme and the light one otherwise.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/track_list_dark.png">
  <img alt="The track list: a search form, a genre filter, the number of tracks and a card for each track with its genre, platform and tag chips." src="docs/screenshots/track_list_light.png">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/version_page_dark.png">
  <img alt="A track page with its details and a list of uploaded versions, each with a status badge, stage, file name and date." src="docs/screenshots/version_page_light.png">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/feedback_cards_dark.png">
  <img alt="AI feedback cards. Each card names the area and priority, what the numbers show, what to try, and the metric paths and values it is based on." src="docs/screenshots/feedback_cards_light.png">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/upload_dialog_dark.png">
  <img alt="The upload dialog: an audio file picker, a stage choice and an optional label, with a note that the audio is deleted after analysis." src="docs/screenshots/upload_dialog_light.png">
</picture>

## What gets measured

| Metric group | How it is measured |
|---|---|
| Loudness: integrated, short-term max, momentary max, loudness range, true peak | ffmpeg's `ebur128` filter (`backend/analysis/loudness.py`) |
| Tempo and key | essentia, on audio decoded to mono float32 at 44.1 kHz. Both always come with a confidence value |
| Spectrum | Energy per octave band, relative to the average across bands (pink-referenced: pink noise reads 0 dB everywhere, real music slopes down, so compare against genre reference curves) |
| Dynamics | `dynamic_range_db`: an approximation of the DR-meter idea. Per channel, the second-highest 3 s block peak against the RMS of the loudest 20% of blocks. **Not** a certified DR14 reading |
| Stereo | `width` is the share of energy in the side signal (0 mono, 0.5 unrelated channels, 1 inverted). `mono_compatible` means the average correlation is above -0.1 |

Spectrum, stereo and dynamics use the first 600 s of the file, tempo and key the first 240 s. A warning is added to the result when a file is truncated. Every result validates against `schema/metrics.schema.json`. The analysis package is pure and framework-free (path in, plain dict out), so the same measurements could later be reimplemented in C++/JUCE against the same schema.

## How honest are the numbers?

Loudness was compared against four independent meters (Youlean, the DAW's meter, SPAN and WLM) on one track:

| | This project | Reference meters |
|---|---|---|
| Integrated loudness | -10.4 LUFS | -10.3 / -10.5 LUFS |
| Short-term max | -8.3 LUFS | -8.3 LUFS |
| Momentary max | -7.8 LUFS | -7.7 / -7.8 LUFS |
| Loudness range | 4.3 LU | 4.3 LU |
| True peak | +1.2 dBTP | +1.2 to +1.3 dBTP |

RMS (the power average of both channels over the whole file) was compared with SPAN's RMS readout on three tracks, and on one of them with ffmpeg's `astats`:

| | This project | Reference |
|---|---|---|
| Track A | -12.07 dBFS | SPAN -12.2 / -12.3 |
| Track B | -12.09 dBFS | SPAN -11.5 / -11.5 |
| Track C | -23.5 dBFS | SPAN -23.9 / -23.9, ffmpeg `astats` -23.50 |

The differences are at most 0.6 dB and change sign from track to track. SPAN reads while the track plays, so a small difference is expected; the cause was not identified.

Not verified yet, and flagged as such:

- Spectrum bands, stereo width and correlation have not been compared against a meter. Checks on synthetic signals pass (pink noise reads flat across the bands, white noise slopes up about 3 dB per octave, identical, inverted and unrelated channels give the expected correlation and width), but they test the definitions, not a meter. How to do the meter checks is in [`docs/DECISIONS.md`](docs/DECISIONS.md).
- Known gap: the `possible_clipping` warning counts samples at or near full scale, so it does not see inter-sample overs. One of my tracks has a true peak of +1.2 dBTP, no clipped samples and no warning. A warning for a true peak above 0 dBTP is planned.
- Dynamic range is an approximation with its own definition, so it is not comparable with DR14 meters.
- Tempo and key were checked on two tracks (123.7 against a true 124 BPM with the key correct, and 128 BPM correct at confidence 0.54). The reliability thresholds that clamp low-confidence feedback are placeholders calibrated on that small sample.

True peak was also compared with SPAN on two more tracks and agrees with its louder channel within 0.1 dB.

The reasoning behind each measurement choice is in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## AI feedback

- Provider: Gemini free tier, behind a `FeedbackGenerator` interface in `backend/app/services/feedback/`. Another provider is one extra class. This is a portfolio project, so it deliberately needs no paid key.
- Output is structured JSON (`summary` plus items with area, severity, observation and suggestion), validated with Pydantic.
- Platform loudness differences (Spotify -14 LUFS, Apple Music -16, YouTube -14, EBU R128 broadcast -23, true-peak ceiling -1 dBTP) are computed in code and cited like measurements. The reference table lives in `references.py` in the feedback service.
- At the demo and mix stages, loudness items are capped at medium priority in code, not only in the prompt, because loudness is a mastering concern.
- A failed feedback call never changes the analysis or its previous feedback.
- The free tier is small and Google changes it without notice. On 2026-11-15 AI Studio showed 15 requests per minute and 500 per day for `gemini-3.5-flash-lite`, and 5 per minute and 20 per day for `gemini-3.6-flash`. A failed citation check makes a second request, so one feedback call can use two. `RATE_LIMIT_FEEDBACK_GLOBAL` (200/day) is set to stay under the larger allowance; with a 20/day model, lower it to 10/day.
- The version page tells you when the feedback is out of date, because the stage, genre or platform changed after it was written.

## Architecture

```
backend/
  analysis/      pure measurement functions, one module per metric group, plus a CLI
  app/           FastAPI application
    routers/     auth, users, tracks, analyses
    services/    background analysis runner, feedback generation and verification
    ...          config, db, models, schemas, security, error handling, rate limits
  alembic/       database migrations
  tests/
frontend/
  src/
    api/         typed client generated from schema/openapi.json, error handling, upload
    app/         router shell
    components/  shared form controls (Button, TextField, SelectField, ...)
    features/    account, analyses, auth, results, tracks
    lib/         shared date and parse helpers
    theme/       theme store and switch
    test/        test setup, API mocks, fixtures
schema/          metrics.schema.json, openapi.json
docs/            API.md (API plan as built), DECISIONS.md (decision log), screenshots/
```

Data model:

```mermaid
erDiagram
    USER ||--o{ TRACK : owns
    USER ||--o{ TAG : owns
    TRACK ||--o{ ANALYSIS : "has versions"
    TRACK }o--o{ TAG : "tagged with"
```

Upload flow: validate extension and size, stream to a randomly named temp file, create the analysis row (`pending`) and answer `202`. A background task then runs the analysis (`running`, then `done` or `failed`), stores the metrics and deletes the temp file in a `finally` block. The client polls `GET /analyses/{id}`.

Stack:
- Backend: Python 3.12+ (developed on 3.14), FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic, SQLite, essentia, numpy and scipy, ffmpeg, pytest.
- Frontend: React and TypeScript (Vite), React Router, TanStack Query, react-hook-form, openapi-fetch, wavesurfer.js, CSS Modules, Vitest, Testing Library and MSW.

## Quickstart

Requirements: Python 3.12 or newer, Node 22 or newer, and `ffmpeg` on your PATH (`brew install ffmpeg` on macOS, `apt install ffmpeg` on Debian or Ubuntu). `pip install essentia` works on Linux and macOS; on Windows use WSL.

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

cp .env.example .env
# set JWT_SECRET, for example:
python -c "import secrets; print(secrets.token_urlsafe(48))"

alembic upgrade head              # creates the database tables
uvicorn app.main:app --reload     # API on http://127.0.0.1:8000, interactive docs at /docs
```

AI feedback needs a Gemini API key (Google AI Studio). Put it in `.env` as `GEMINI_API_KEY`, and set `GEMINI_MODEL` to a current model name (`.env.example` uses `gemini-3.5-flash-lite`, which has the larger free-tier allowance). Without a key everything else works and `POST /analyses/{id}/feedback` answers `503 not_configured`.

Analyse a file without the API:

```bash
python -m analysis.cli ../samples/my_track.wav --genre "house" --platform spotify --stage mix
# --skip-tempo-key skips essentia
```

Tests and linting:

```bash
pytest                            # 373 tests; one opt-in live test is skipped by default
ruff check . && ruff format .
```

### Frontend

In a second terminal, with the backend running:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev                       # http://localhost:5173
```

Open http://localhost:5173, register an account and create a track. The dev server always uses port 5173, because the API's CORS list names it; it refuses to start if the port is taken.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Runs the tests once (`npm run test:watch` watches) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier check (`npm run format` writes) |
| `npm run build` | Type check and production build into `frontend/dist` |
| `npm run api:types` | Regenerates `src/api/schema.d.ts` from `schema/openapi.json` |

There are 821 frontend tests. Typecheck, lint, format check and build pass, and `npm audit --omit=dev` reports no vulnerabilities. The `npm audit` findings in the development tools are reviewed in [`docs/DECISIONS.md`](docs/DECISIONS.md).

Frontend settings are environment variables in `frontend/.env`. Vite reads them when it builds, so a change needs a restart or a rebuild.

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://127.0.0.1:8000` | Where the API is. Its origin has to be allowed by the API's `CORS_ORIGINS` |
| `VITE_MAX_UPLOAD_MB` | `100` | Largest file the upload dialog accepts. A convenience check only; the server's `MAX_UPLOAD_MB` decides |

## Configuration

All backend settings are environment variables, optionally in `backend/.env`. See `backend/.env.example`.

| Variable | Default | Meaning |
|---|---|---|
| `ENVIRONMENT` | `development` | Anything else requires a real `JWT_SECRET` |
| `DATABASE_URL` | `sqlite:///./app.db` | SQLAlchemy URL |
| `JWT_SECRET` | dev-only value | Signing secret for access tokens |
| `ACCESS_TOKEN_MINUTES` | `30` | Access token lifetime |
| `CORS_ORIGINS` | Vite dev origins in development, none otherwise | Comma-separated frontend origins. `*` is rejected |
| `MAX_UPLOAD_MB` | `100` | Largest audio upload |
| `MAX_REQUEST_BODY_KB` | `256` | Largest body for every other request |
| `RATE_LIMIT_ENABLED` | `true` | Master switch for rate limiting |
| `RATE_LIMIT_REGISTER` | `5/hour` | Per client IP |
| `RATE_LIMIT_LOGIN` | `10/minute` | Per client IP, every attempt counts |
| `RATE_LIMIT_UPLOAD` | `20/hour` | Per user |
| `RATE_LIMIT_FEEDBACK` | `10/hour` | Per user |
| `RATE_LIMIT_FEEDBACK_GLOBAL` | `200/day` | Shared by all users (protects the free-tier quota). Empty disables it |
| `RATE_LIMIT_DELETE_ACCOUNT` | `5/hour` | Per user |
| `MAX_TRACKS_PER_USER` | `200` | Track quota |
| `MAX_ANALYSES_PER_TRACK` | `50` | Versions per track |
| `MAX_ACTIVE_ANALYSES_PER_USER` | `2` | Pending plus running analyses per user |
| `MAX_ACTIVE_ANALYSES_GLOBAL` | `10` | Pending plus running across all users, beyond which uploads get `503` |
| `MAX_CONCURRENT_ANALYSES` | `2` | Analyses running at once (ffmpeg and essentia are CPU heavy) |
| `FEEDBACK_PROVIDER` | `gemini` | Only `gemini` is implemented |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | unset | Feedback provider settings |
| `FEEDBACK_TIMEOUT_SECONDS`, `FEEDBACK_MAX_TOKENS` | `60`, `8192` | Feedback call limits |

Rates are written `COUNT/PERIOD` with the period one of `second`, `minute`, `hour` or `day`. A typo fails at startup.

## API overview

Interactive documentation is served at `/docs`. The full plan, with rules and error codes, is in [`docs/API.md`](docs/API.md).

| Method and path | Purpose |
|---|---|
| `POST /auth/register`, `POST /auth/login` | Create an account, get a bearer token |
| `GET /users/me`, `DELETE /users/me` | Current user; delete the account and all its data (needs the password) |
| `POST /tracks`, `GET /tracks`, `GET/PATCH/DELETE /tracks/{id}` | Track CRUD with tags, search and paging |
| `POST /tracks/{id}/analyses`, `GET /tracks/{id}/analyses` | Upload a version (returns 202), list versions |
| `GET/PATCH/DELETE /analyses/{id}` | Status, metrics and feedback; edit label or stage; delete a version |
| `POST /analyses/{id}/feedback` | Generate (or regenerate) AI feedback |
| `GET /health` | Liveness check |

Every error has one shape, with a stable machine-readable code:

```json
{"error": {"code": "not_found", "message": "Track not found"}}
```

The frontend branches on `error.code`, never on the message.

## Security and privacy

- Passwords are hashed with Argon2. Login failures give one generic message, and unknown emails take about as long to answer as wrong passwords.
- Access tokens are short-lived JWTs (30 minutes). User ids are never reused, so a token from a deleted account can never authenticate as someone else.
- The frontend keeps the token in `sessionStorage`, so it ends with the browser tab, and clears it on a 401 or on sign-out. The theme choice is kept in `localStorage`.
- Every query is filtered by the current user. Another user's resource returns `404`, not `403`, so ids cannot be probed.
- Deleting an account requires the password, and the database cascades the deletion to everything the user owns.
- Audio files are written to randomly named temp files (the client's file name is only a label), size-limited, and deleted after analysis. Their contents are never logged. The waveform is drawn in the browser from the file you chose and is never uploaded a second time or stored.
- ffmpeg is always called with an argument list and a timeout, never through a shell.
- Unexpected errors return a generic `500` with a request id. The traceback goes to the server log only.
- CORS allows only the configured frontend origins, and 413, 429 and 500 responses keep their CORS headers so the frontend can read them.
- Rate limits, quotas and capacity caps protect the CPU and the free-tier AI quota.

## Accessibility

What has been done:

- Native controls and dialogs, labelled form fields, and status and error messages that are announced.
- Automated checks: the page and component tests run axe (vitest-axe). jsdom has no layout, so its `color-contrast` and `region` rules are turned off, and contrast is checked another way.
- Contrast: every colour pair in the design tokens was calculated with the WCAG formula, in the light and the dark theme. Text is at least 4.5:1 and non-text parts at least 3:1. Card borders (about 1.5 to 1.7:1) are decorative and not held to that. The upload progress bar was judged by eye, not calculated.
- Colour never carries meaning alone: priorities are written out, the spectrum chart has a hidden data table, and its direction does not depend on colour.
- Keyboard: the dialogs were checked by hand in a browser (focus moves into the dialog, Esc closes it, focus returns to the opener). The waveform has a native "Position" slider that moves 1 s with the arrow keys and 10 s with Page Up and Page Down, covered by automated tests.
- The theme follows the operating system and can be set to light or dark.

What has not:

- VoiceOver on macOS was used on the Tracks page only, where lists are announced with their counts. Still to check: the "Error:" prefix on form fields, the lists in the feedback cards, and how the position slider is spoken. One report is unexplained: a track's genre text was announced as "clickable" until the track was edited.
- Other screen readers, and keyboard-only use of every page, have not been tested systematically.
- This is not an accessibility audit and makes no claim of WCAG conformance.

## Database and migrations

The schema is managed by Alembic. The app does not create tables itself; if they are missing it refuses to start with a message telling you to run the migrations.

```bash
alembic upgrade head                              # apply migrations
alembic revision --autogenerate -m "add x to y"   # after changing a model; review the file it writes
alembic downgrade -1                              # undo the last migration
```

A test runs the migrations on a fresh database and compares the result with the models, so a model change without a migration fails the test suite.

## Running it for real: assumptions and limits

Nothing here has been deployed yet. These notes follow from how the code is built; they have not been tried on a server.

- **Single process.** Background tasks, the rate limiter and the analysis concurrency cap live in memory. A restart resets rate-limit counters, and analyses left running by a previous process are marked `failed` (`interrupted`) at startup. Several workers would each count separately; scaling out means a job queue and a shared store such as Redis.
- **Reverse proxy.** Put a request-body limit on the proxy that matches `MAX_UPLOAD_MB`: the application rejects oversized bodies, but only after they have reached it. It allows 1 MB more than `MAX_UPLOAD_MB` for the multipart framing, and a megabyte is 1024 × 1024 bytes. Run uvicorn with `--proxy-headers` and `--forwarded-allow-ips` set to the proxy, otherwise per-IP limits see the proxy's address for every client. Serve everything over HTTPS, because the bearer token travels in a header.
- **CORS.** Set `CORS_ORIGINS` to the exact origin the frontend is served from (for example `https://app.example.com`). `*` is refused at startup.
- **Secrets.** Set `ENVIRONMENT` to anything other than `development` and set a real `JWT_SECRET` (generate one as in the quickstart). The application refuses to start outside development with the built-in secret. Keep `GEMINI_API_KEY` in the environment, never in the repository.
- **Migrations.** Run `alembic upgrade head` before starting a new version. They are never run automatically.
- **Frontend.** `npm run build` writes static files to `frontend/dist`. `VITE_API_URL` and `VITE_MAX_UPLOAD_MB` are fixed at build time, so rebuild to change them. The server has to answer unknown paths such as `/tracks/3` with `index.html`, because the routes live in the browser.
- **System tools.** The server needs `ffmpeg` and essentia (Linux or macOS).
- **SQLite.** Fine for a demo. `DATABASE_URL` allows moving to Postgres.

## Roadmap

- Verify spectrum and stereo against a meter; calibrate tempo and key reliability on more tracks, including half-time ones.
- Check the feedback quality on `gemini-3.5-flash-lite`, store the model that answered with each feedback, and warn about a true peak above 0 dBTP.
- Genre reference curves for the spectrum.
- Version comparison endpoint (`GET /tracks/{id}/compare`) and a view for it.
- `GET /tags`, so the track list can offer a tag picker.
- The remaining VoiceOver checks.
- Optional follow-up chat about a result.
- A script that dumps `schema/openapi.json` from the backend.
- Refresh tokens, a job queue, Postgres.

Out of scope for now: a DAW plugin, audio generation, stem separation and sample-library search.

## Licence

The code in this repository is released under the [MIT licence](LICENSE).

The analysis needs essentia, which is licensed under AGPL-3.0 (`pip show essentia` reports `AGPL-3.0-only`). This repository does not contain essentia; it only requires it. Anyone who runs or redistributes the whole project together with essentia has to follow essentia's own terms.

## Project documents

- [`docs/API.md`](docs/API.md): the API and data model as built.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): the decision log, including what changed and why.
- [`frontend/README.md`](frontend/README.md): the frontend on its own.
- [`LICENSE`](LICENSE): the MIT licence.

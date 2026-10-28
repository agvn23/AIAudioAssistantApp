# API and data model plan (week 2)

Scope confirmed: accounts with token auth, full CRUD on Tracks, and one Analysis per uploaded version of a track. Items marked *proposed* are defaults you can change.

## Stack additions (proposed)
- SQLAlchemy 2.0 for models, Pydantic v2 for request/response schemas, Alembic for migrations (added once the models settle, after slice 3; until then tables are created at startup, so delete `app.db` whenever a model changes)
- SQLite to start (a `DATABASE_URL` env var lets you move to Postgres later)
- Auth: email + password, Argon2 hashing (`pwdlib[argon2]`), JWT bearer tokens (`PyJWT`)
- Config via environment variables (`pydantic-settings`); `.env` is git-ignored, `.env.example` is committed
- Also needed: `python-multipart` (uploads), `email-validator`, `anthropic` (feedback)

## Data model

```
User 1 ─── * Track 1 ─── * Analysis
                │
                * ─── * Tag (unique name per user)
```

| Table | Fields |
|---|---|
| `users` | id, email (unique), password_hash, created_at |
| `tracks` | id, user_id (FK, cascade delete), title, genre, target_platform, notes, created_at, updated_at |
| `tags` | id, user_id (FK), name; unique (user_id, name) |
| `track_tags` | track_id, tag_id (many-to-many) |
| `analyses` | id, track_id (FK, cascade delete), version_number, label, stage (demo/mix/master), original_filename, status (pending/running/done/failed), error_code, metrics (JSON, matches `schema/metrics.schema.json`), feedback (JSON, nullable), created_at |

Deleting a track deletes its analyses; deleting a user deletes everything they own.
The uploaded audio is a temporary file, deleted as soon as analysis finishes (success or failure). Only the metrics JSON is stored.

## Endpoints

| Method and path | Purpose | Auth |
|---|---|---|
| `GET /health` | liveness check | no |
| `POST /auth/register` | create account (email, password) | no |
| `POST /auth/login` | returns `access_token` (JWT) | no |
| `GET /users/me` | current user | yes |
| `DELETE /users/me` | delete account and all data | yes |
| `POST /tracks` | create track (with tags) | yes |
| `GET /tracks` | list own tracks; filters `q`, `genre`, `tag`; paging | yes |
| `GET /tracks/{id}` | one track with its analyses (summary) | yes |
| `PATCH /tracks/{id}` | edit title, genre, platform, notes, tags | yes |
| `DELETE /tracks/{id}` | delete track and its analyses | yes |
| `POST /tracks/{id}/analyses` | upload a file (multipart) + optional stage/label; returns 202 and an analysis id | yes |
| `GET /tracks/{id}/analyses` | list versions | yes |
| `GET /analyses/{id}` | status, metrics, feedback | yes |
| `PATCH /analyses/{id}` | edit label or stage | yes |
| `DELETE /analyses/{id}` | delete one version | yes |
| `POST /analyses/{id}/feedback` | generate (or regenerate) AI feedback | yes |
| `GET /tracks/{id}/compare?from=&to=` | metric differences between two versions (stretch) | yes |

Rules:
- Every query is filtered by the current user. Another user's resource returns **404**, not 403, so ids cannot be probed.
- Errors from the analysis engine (`AnalysisError.code`) are stored on the analysis as `failed` + `error_code`; the API never returns a raw stack trace.
- Passwords: minimum length, generic "invalid credentials" message on login failure.

## Upload and analysis flow
1. Validate: extension/content type allow-list, size limit (`MAX_UPLOAD_MB`, e.g. 100).
2. Write to a temp file with a random name (never build a path from the client's filename).
3. Create the analysis row (`pending`) and return 202.
4. A background task runs `analyze_file` (status `running`, then `done` or `failed`), stores the metrics, and deletes the temp file in a `finally` block.
5. The frontend polls `GET /analyses/{id}` until the status is `done`.

Background tasks are enough for v1. If analysis gets slow or you need retries, move to a queue later.

## AI feedback
- Input: the stored metrics JSON plus track context (genre, target platform, stage). Nothing else, never the audio.
- System prompt rules: use only the numbers provided, say so when confidence is low, give prioritized, actionable suggestions.
- Output: JSON validated with Pydantic, for example `{summary, items: [{area, severity, observation, suggestion}]}`, stored in `analyses.feedback`.
- Model name and API key come from environment variables (`ANTHROPIC_MODEL`, `ANTHROPIC_API_KEY`); check the current model names in Anthropic's docs rather than hard-coding one.
- Handle API errors and timeouts: a failed feedback call must not break the analysis.

## Security checklist
- JWT secret from the environment; short-lived access tokens (30 min).
- CORS limited to the frontend origin only.
- ffmpeg always called with an argument list and a timeout (already true in the analysis code).
- Size limits on uploads; consider a simple per-user rate limit later.
- Stretch: refresh tokens, stored hashed and rotated on use.

## Build order (one slice at a time, feature branches)
1. Config, database, users, register/login/me + tests
2. Tracks and tags CRUD + ownership tests
3. Upload and analysis (background task) + analysis endpoints
4. AI feedback
5. Account deletion, error mapping, CORS, limits, README

Testing: pytest with FastAPI's `TestClient` and an in-memory SQLite database; httpx is already in the dev requirements.

## Frontend implications (week 3)
Login/register, track list with search/filter/tags and edit/delete, "add version" upload with a progress/polling state, results page (metrics, spectrum chart, warnings, AI feedback cards). FastAPI generates an OpenAPI spec, so TypeScript types can be generated from it instead of written by hand.

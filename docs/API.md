# API and data model (week 2, as built)

Scope: accounts with token auth, full CRUD on Tracks, and one Analysis per uploaded version of a track, plus AI feedback and the hardening layer (errors, CORS, limits, migrations). Slices 1 to 5 are done. Decisions and their reasons are in `DECISIONS.md`.

## Stack
- FastAPI, SQLAlchemy 2.0 models, Pydantic v2 schemas, Alembic migrations (`backend/alembic/`; the app does not create tables itself)
- SQLite to start (`DATABASE_URL` allows Postgres later)
- Auth: email + password, Argon2 hashing (`pwdlib[argon2]`), JWT bearer tokens (`PyJWT`)
- Config via environment variables (`pydantic-settings`); `.env` is git-ignored, `.env.example` is committed
- Uploads need `python-multipart`; email validation needs `email-validator`
- AI feedback: Gemini free tier (`google-genai`) behind the `FeedbackGenerator` interface

## Data model

```
User 1 ─── * Track 1 ─── * Analysis
                │
                * ─── * Tag (unique name per user)
```

| Table | Fields |
|---|---|
| `users` | id (AUTOINCREMENT on SQLite, so ids are never reused), email (unique), password_hash, created_at |
| `tracks` | id, user_id (FK, cascade delete), title, genre, target_platform, notes, created_at, updated_at |
| `tags` | id, user_id (FK, cascade delete), name; unique (user_id, name) |
| `track_tags` | track_id, tag_id (many-to-many, both cascade) |
| `analyses` | id, track_id (FK, cascade delete), version_number, label, stage (demo/mix/master), original_filename, status (pending/running/done/failed), error_code, metrics (JSON, matches `schema/metrics.schema.json`), feedback (JSON, nullable), created_at; unique (track_id, version_number) |

Deleting a track deletes its analyses; deleting a user deletes everything they own. The database does this (`ON DELETE CASCADE`, foreign keys are enabled on every SQLite connection). Every constraint has an explicit, predictable name (naming convention in `app/db.py`), which batch migrations on SQLite rely on.

The uploaded audio is a temporary file, deleted as soon as analysis finishes (success or failure). Only the metrics JSON is stored.

## Endpoints

| Method and path | Purpose | Auth |
|---|---|---|
| `GET /health` | liveness check | no |
| `POST /auth/register` | create account (email, password) | no |
| `POST /auth/login` | OAuth2 password form (`username` carries the email); returns `access_token` (JWT) | no |
| `GET /users/me` | current user | yes |
| `DELETE /users/me` | delete the account and all data. JSON body `{"password": "..."}`; 204, or 403 `invalid_password` | yes |
| `POST /tracks` | create track (with tags) | yes |
| `GET /tracks` | list own tracks; filters `q`, `genre`, `tag`; paging | yes |
| `GET /tracks/{id}` | one track | yes |
| `PATCH /tracks/{id}` | edit title, genre, platform, notes, tags | yes |
| `DELETE /tracks/{id}` | delete track and its analyses | yes |
| `POST /tracks/{id}/analyses` | upload a file (multipart: `file`, optional `stage`, `label`); returns 202 with the new analysis (`pending`) | yes |
| `GET /tracks/{id}/analyses` | list versions (summaries, no metrics), oldest first | yes |
| `GET /analyses/{id}` | status, metrics, feedback | yes |
| `PATCH /analyses/{id}` | edit label or stage | yes |
| `DELETE /analyses/{id}` | delete one version | yes |
| `POST /analyses/{id}/feedback` | generate (or regenerate) AI feedback, synchronously | yes |
| `GET /tracks/{id}/compare?from=&to=` | metric differences between two versions (stretch, not built) | yes |

Rules:
- Every query is filtered by the current user. Another user's resource returns **404**, not 403, so ids cannot be probed.
- Errors from the analysis engine (`AnalysisError.code`) are stored on the analysis as `failed` + `error_code`; the API never returns a raw stack trace.
- Passwords: 8 to 128 characters, generic "Incorrect email or password" message on login failure.
- Allowed upload types: .wav .mp3 .flac .aif .aiff .m4a .ogg. The extension is checked on upload; real content problems show up later as a failed analysis with an `error_code`.

## Errors

Every error response has one shape:

```json
{"error": {"code": "not_found", "message": "Track not found"}}
```

- `code` is stable and machine-readable; `message` is safe to show to a person.
- 422 responses add `fields`: `[{"location": "body", "field": "tags", "message": "..."}]`. The submitted value is never echoed.
- Unexpected exceptions return a generic 500 with a `request_id` in the body. The traceback and the same id go to the server log only. Every response also carries an `X-Request-ID` header.
- 401 responses keep `WWW-Authenticate: Bearer`; 405 keeps `Allow`; 429 and some 503 responses carry `Retry-After` (seconds).

| Status | Code | When |
|---|---|---|
| 400 | `bad_request` | malformed request |
| 401 | `unauthorized` | missing, invalid or expired token; wrong email or password |
| 403 | `invalid_password` | wrong password on account deletion |
| 404 | `not_found` | unknown route or resource, including other users' resources |
| 405 | `method_not_allowed` | wrong HTTP method |
| 409 | `conflict` | duplicate email, conflicting update, feedback on an unfinished analysis |
| 409 | `quota_exceeded` | track or version quota reached |
| 413 | `payload_too_large` | body or file over the limit |
| 415 | `unsupported_media_type` | upload extension not allowed |
| 422 | `validation_error` | invalid input (with `fields`), empty upload |
| 429 | `rate_limited` | rate limit used up (`Retry-After`) |
| 429 | `too_many_active_analyses` | the user already has analyses pending or running (`Retry-After`) |
| 500 | `internal_error` | unexpected error (`request_id`) |
| 502 | `provider_error`, `invalid_output` | feedback provider failed, or its output failed verification |
| 503 | `not_configured` | feedback provider not configured |
| 503 | `server_busy` | too many analyses in progress server-wide (`Retry-After`) |
| 504 | `timeout` | feedback provider timed out |

## Behaviour details

Tracks and tags:
- There are no `/tags` endpoints: tags are managed through tracks. They are created on first use and replaced as a whole set by PATCH. A tag nobody uses any more is deleted. `GET /tags` can be added if the UI needs a tag picker.
- Tag names are lower-cased, whitespace-collapsed and de-duplicated, with limits of 30 characters and 10 tags per track. The `?tag=` filter is normalised the same way.
- Field limits, in characters: title 200, genre 100, target platform 100, notes 5000, analysis label 100. The numbers in `schema/openapi.json` are the source of truth; the frontend reads them from there and counts characters after trimming.
- `GET /tracks` returns `{items, total, limit, offset}`, newest first. `limit` is 1 to 100 and defaults to 20. `q` searches title and notes case-insensitively and treats `%` and `_` literally.
- `PATCH` changes only the fields you send. `null` clears genre, target platform and notes; title and tags cannot be null. A tags-only change still updates `updated_at`.
- `GET /tracks/{id}` does not include analyses; list them with `GET /tracks/{id}/analyses`.

Account deletion: needs the current password in the body (so a stolen token alone cannot wipe an account). Everything the user owns is removed by the database. A background analysis or feedback call still running for that user ends harmlessly, because both write with a plain UPDATE that matches no row, and the temp file is still deleted.

## Upload and analysis flow
1. Body-size middleware: reject a declared or streamed body over `MAX_UPLOAD_MB` plus 1 MB of multipart framing with 413 (other requests are limited to `MAX_REQUEST_BODY_KB`). A megabyte here is 1024 × 1024 bytes, and the frontend converts the same way.
2. The route checks track ownership (404), the extension allow-list (415), then quotas and capacity, then the upload rate limit.
3. The file is streamed to a randomly named temp file (never a path built from the client's file name), with the size limit enforced again.
4. The analysis row is created (`pending`) and the response is 202.
5. A background task waits for a free analysis slot, runs `analyze_file` (status `running`, then `done` or `failed`), stores the metrics, and deletes the temp file in a `finally` block.
6. The frontend polls `GET /analyses/{id}` until the status is `done` or `failed`.

Analyses still `pending` or `running` when the server starts belong to a previous process and are marked `failed` with `error_code: interrupted`.

Background tasks are enough for v1. If analysis gets slow or you need retries, move to a queue.

## AI feedback
- Input: the stored metrics JSON plus track context (genre and target platform read from the track at call time, stage from the analysis row). Nothing else, never the audio, file name or notes.
- Output: JSON validated with Pydantic (`feedback/schemas.py`), stored in `analyses.feedback`: `{summary, items, caveats, meta}`. Each item is `{area, priority, observation, suggestion, evidence}`. `area` is one of loudness, dynamics, tempo, key, spectrum, stereo, overall; `priority` is high, medium or low; `evidence` is a list of `{metric, value}` (path into the metrics JSON, or `reference.integrated_lufs_difference` / `reference.true_peak_over_ceiling_db`, computed per call from the platform table, positive meaning louder or higher than the target). `meta` is added by the server: `{model, model_version, generated_at, context_used: {genre, target_platform, stage}, feedback_schema_version}`. The server verifies every cited path and value, retries once, then answers 502.
- `meta.context_used` holds the context as it was sent to the model, after cleaning. The free-text values (genre, target platform) are cleaned by `_clean_text` in `app/services/feedback/prompt.py`: angle brackets and ASCII control characters (U+0000 to U+001F and U+007F) become spaces, whitespace is collapsed the way Python's `str.split()` does, the text is cut to 100 code points (`MAX_CONTEXT_CHARS`) and trimmed, and case is unchanged. The frontend repeats this cleaning (`contextText.ts`) to tell whether the track's genre or platform changed since the feedback was written, so a change to `_clean_text` has to be mirrored there.
- `meta.model` is the model name the server asked for. `meta.model_version` is the model name the provider reported in its answer (`model_version` in the Gemini response); the two can differ. It is `null` when the provider did not report one, and absent from feedback stored before 2026-11-16. After a citation retry it is the version that answered the attempt that was kept.
- Environment: `FEEDBACK_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `FEEDBACK_TIMEOUT_SECONDS`, `FEEDBACK_MAX_TOKENS`.
- A failed feedback call never changes the analysis or its previous feedback. Errors carry the provider code (`not_configured`, `timeout`, `provider_error`, `invalid_output`).

## Limits, quotas and capacity

Rate limits are in memory, per process, and written `COUNT/PERIOD` (period: second, minute, hour, day). Defaults:

| Limit | Default | Keyed by | Setting |
|---|---|---|---|
| Register | 5/hour | client IP | `RATE_LIMIT_REGISTER` |
| Login (every attempt counts) | 10/minute | client IP | `RATE_LIMIT_LOGIN` |
| Upload | 20/hour | user | `RATE_LIMIT_UPLOAD` |
| Feedback | 10/hour | user | `RATE_LIMIT_FEEDBACK` |
| Feedback, shared budget | 200/day | all users | `RATE_LIMIT_FEEDBACK_GLOBAL` (empty = off) |
| Delete account | 5/hour | user | `RATE_LIMIT_DELETE_ACCOUNT` |

- Requests refused by validation, ownership (404) or status (409) checks do not use up a budget. When both a per-user and the shared feedback rule apply, either both record the hit or neither does.
- `RATE_LIMIT_ENABLED=false` switches all rate limiting off (used by the test suite).
- Quotas: `MAX_TRACKS_PER_USER` (200), `MAX_ANALYSES_PER_TRACK` (50), both answering 409 `quota_exceeded`.
- Capacity: `MAX_ACTIVE_ANALYSES_PER_USER` (2) answers 429 `too_many_active_analyses`; `MAX_ACTIVE_ANALYSES_GLOBAL` (10) answers 503 `server_busy`; `MAX_CONCURRENT_ANALYSES` (2) is how many actually run at once, the rest stay `pending`.
- Behind a reverse proxy, put a body-size limit on the proxy and run uvicorn with `--proxy-headers` and `--forwarded-allow-ips`, otherwise per-IP limits see the proxy's address.

## Security checklist
- [x] JWT secret from the environment (a real one is required outside development); short-lived access tokens (30 min)
- [x] Argon2 password hashing; generic login failure message with similar timing for unknown emails
- [x] Ownership checks on every resource (404, not 403)
- [x] User ids never reused (AUTOINCREMENT), so a deleted account's token cannot work for a new user
- [x] Account deletion needs the password and cascades
- [x] CORS limited to `CORS_ORIGINS` (explicit origins, no wildcard, no credentials)
- [x] ffmpeg always called with an argument list and a timeout
- [x] Size limits on uploads and on every other body
- [x] Rate limits per IP and per user; quotas; capacity caps
- [x] No raw stack traces; request ids for log correlation
- [ ] Stretch: refresh tokens, stored hashed and rotated on use

## Build order (one slice at a time, feature branches)
1. Config, database, users, register/login/me + tests (done)
2. Tracks and tags CRUD + ownership tests (done)
3. Upload and analysis (background task) + analysis endpoints (done)
4. AI feedback (done)
5. Account deletion, error mapping, CORS, limits, Alembic, README (done)

Testing: pytest with FastAPI's `TestClient` and an in-memory SQLite database; httpx is in the dev requirements. Migrations are tested on a temporary SQLite file and compared with the models.

## How the frontend uses the API (week 3, as built)
Login and register, a track list with search, genre and tag filters and paging, track create, edit and delete, an upload dialog with progress, a version list with polling, and a version page with metrics, a spectrum chart and AI feedback cards.
- FastAPI generates an OpenAPI spec (the error envelope is documented in it), so TypeScript types can be generated from it instead of written by hand. `schema/openapi.json` is committed and `npm run api:types` regenerates the types from it. No script dumps the spec from the backend yet.
- Every failure becomes one `ApiError` in one place, and the code branches on `error.code`, never on the message. `fields` of a 422 are shown next to the inputs.
- On 401 the token is cleared and the person goes to login. `X-Request-ID` and `Retry-After` are readable from JavaScript.
- `Retry-After` on 429 and 503 becomes a countdown: on the upload button for `rate_limited`, `too_many_active_analyses` and `server_busy`, and on the feedback button for `rate_limited`.
- The upload uses `XMLHttpRequest` for progress and goes through the same error handling.
- `GET /analyses/{id}` is polled every 2 seconds while the status is `pending` or `running`. Polling stops on `done`, `failed` and any 4xx; network errors and 5xx keep it going. The version list is polled while any version is active.
- Metrics and feedback are parsed at runtime. Results show only for a finished analysis with readable metrics. Generating or regenerating feedback is one call with no automatic retry, because every attempt spends quota.
- The platform reference table stays on the server; the frontend only explains the `reference.*` evidence paths.
- Set `CORS_ORIGINS` to the frontend's address (the Vite dev origins are the development default).

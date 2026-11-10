# Decisions

A running log of project decisions. Add new entries at the bottom of the table with the date. Keep each entry to a line or two, and say why when it isn't obvious. Superseded decisions stay in the log, struck through, so the history is visible.

## Decided

| Date | Decision | Notes |
|---|---|---|
| 2026-10-26 | 4-week project, built one slice at a time on feature branches | Plan: analysis engine, then API with CRUD and LLM feedback, then web UI, then hardening |
| 2026-10-26 | Main function: analyze an uploaded track (loudness, key, BPM, spectrum feedback) | Generation, stem separation and sample-library search are out of scope for now |
| 2026-10-26 | Delivered as a web app | The bootcamp focuses on web apps; a DAW plugin is a possible follow-up project |
| 2026-10-26 | Loudness (LUFS, LRA, true peak) measured with ffmpeg's `ebur128` filter | `backend/analysis/loudness.py` |
| 2026-10-26 | BPM and key via essentia | Native Python essentia in `backend/analysis/tempo_key.py` |
| 2026-10-26 | Repo root is `AIAudioAssistantApp`, with the backend in `backend/` | Frontend in `frontend/`; shared schema in `schema/` |
| 2026-10-26 | ~~Claude Chat for planning, Claude Code for building in the repo~~ | Superseded below. `CLAUDE.md` at the repo root still carries the project context |
| 2026-10-26 | ~~Backend in TypeScript with essentia.js~~ | Superseded below |
| 2026-10-26 | **Python analysis + FastAPI API + React/TypeScript frontend** | Supersedes the TypeScript backend. Reasons: the goal is audio AI/plugin work, where Python (essentia, numpy, ML tooling) is the norm for analysis; essentia runs natively instead of through WebAssembly; one backend language is faster to build in 4 weeks. FastAPI chosen over ASP.NET Core to keep a single backend |
| 2026-10-27 | Spectrum bands are pink-referenced: energy per octave, relative to the average across bands | Pink noise reads 0 dB everywhere; real music slopes down, so compare against genre reference curves |
| 2026-10-27 | `dynamic_range_db` is an approximation of the DR-meter idea: per channel, second-highest 3 s block peak vs RMS of the loudest 20% of blocks | Not a certified DR14 reading; label it as approximate in the UI |
| 2026-10-27 | Stereo `width` = share of energy in the side signal (0 mono, 0.5 unrelated channels, 1 inverted); `mono_compatible` = average correlation above -0.1 | Simple definitions; revisit if they disagree with a reference meter |
| 2026-10-27 | Spectrum, stereo and dynamics use the first 600 s decoded at 44.1 kHz; tempo and key the first 240 s | A warning is added to the result when a file is truncated |
| 2026-10-27 | CRUD scope confirmed: Track (title, genre, target platform, notes, tags) with full CRUD; Analysis (one per uploaded version, deleted with its track); user accounts with token auth | Accounts and tokens matter for the bootcamp. Detail in `docs/API.md` |
| 2026-10-27 | *Proposed:* email + password, Argon2 hashing, short-lived JWT bearer tokens; refresh tokens as a stretch | Change if the bootcamp prescribes a different auth approach |
| 2026-10-27 | *Proposed:* SQLAlchemy 2.0 + Pydantic v2 on SQLite, Alembic migrations once the models settle; uploaded audio is a temporary file deleted after analysis, only metrics JSON is stored | Move to Postgres via `DATABASE_URL` only if needed |
| 2026-11-02 | AI feedback uses the Gemini free tier behind a `FeedbackGenerator` interface | The project is for the bootcamp and display only, so no paid key. Another provider (for example Anthropic) is one extra class in `generators.py`. Env: `FEEDBACK_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL` |
| 2026-11-02 | Feedback is generated synchronously by `POST /analyses/{id}/feedback`; a failure never changes the analysis or its previous feedback | Errors: 409 not finished, 503 not configured, 504 timeout, 502 provider error or unusable output |
| 2026-11-02 | Every feedback item cites metrics by path and value; the server verifies them against the stored metrics, retries once, then returns 502. Tempo/key items on unreliable measurements are clamped to low priority | Reliability thresholds (tempo 0.4, key 0.5) are placeholders calibrated on one track (128 BPM correct at 0.54) |
| 2026-11-02 | The LLM gets genre and platform from the track, stage from the analysis row, never the file name or notes; free-text context is sanitised | Stage can be edited after analysis, so `metrics.context` is not used |
| 2026-11-02 | Platform loudness reference table in `references.py` (Spotify -14 LUFS, Apple Music -16, YouTube -14, EBU R128 broadcast -23; true-peak ceiling -1 dBTP). Differences from the track are computed in code and cited like measurements | Only Spotify publishes its own number; the rest are commonly cited, and `basis` says so. Club and other platforms get no reference. Review the table now and then |
| 2026-11-02 | At the demo and mix stages loudness items are capped at medium priority in code (not only in the prompt), unless samples are clipped | The final limiter comes later, so loudness is a mastering concern |
| 2026-11-05 | Slices 2 to 5 are built in Claude chat: whole files plus tests, run locally, one slice at a time on a feature branch. Claude Code is not used | Supersedes the Claude Code row above |
| 2026-11-05 | The auth and database stack proposed on 2026-10-27 is what was built (Argon2, 30-minute JWTs, SQLAlchemy 2.0 + Pydantic v2 on SQLite); Alembic was added in slice 5 | Refresh tokens and Postgres remain stretch goals |
| 2026-11-05 | Feedback model in use: `gemini-3.5-flash` | `gemini-3.8-flash` was overloaded when tried. Check current model names in the docs rather than hard-coding one |
| 2026-11-05 | One error format for the whole API: `{"error": {"code", "message", "fields"?, "request_id"?}}`, replacing FastAPI's `detail`. Codes are stable strings (list in `docs/API.md`) | The frontend branches on `code`. 422 responses never echo the submitted value, so a rejected password is not sent back. `ApiError` carries an explicit code where the status is not enough |
| 2026-11-05 | Unexpected exceptions become a generic 500 through a middleware inside CORS, not an exception handler. Every response has `X-Request-ID`, and the log line for a 500 carries the same id | Starlette's own 500 handler sits outside CORS, so those 500s would lack CORS headers and the browser would hide the real error |
| 2026-11-05 | `ApiError` derives from FastAPI's `HTTPException` | FastAPI turns any other exception raised while reading a request body into a 400 but re-raises its own `HTTPException`; the body-size middleware needs 413 to come through |
| 2026-11-05 | `DELETE /users/me` requires the current password in a JSON body (403 `invalid_password`) and is rate-limited | A stolen 30-minute token alone should not be able to wipe an account. Everything cascades in the database |
| 2026-11-05 | `users.id` is AUTOINCREMENT on SQLite | Without it SQLite reuses the highest id after a delete, and a deleted user's unexpired token would authenticate as the next person to register. Regression test included. Tracks, tags and analyses are always ownership-checked, so they do not need it |
| 2026-11-05 | CORS: `CORS_ORIGINS` is an explicit comma-separated list. Unset means the Vite dev origins in development and none elsewhere; `*` is rejected at startup; no credentials | Auth uses a bearer header, so there are no cookies to protect. `X-Request-ID` and `Retry-After` are exposed to the browser |
| 2026-11-05 | Request body limits in a middleware: uploads get `MAX_UPLOAD_MB` plus 1 MB of multipart framing, everything else `MAX_REQUEST_BODY_KB` (256). Declared lengths are rejected before reading; chunked or understated bodies are counted while streaming | The application cannot stop a body from arriving, only from being processed: deployment needs a body limit on the reverse proxy too |
| 2026-11-05 | Own in-memory sliding-window rate limiter instead of a library. Defaults: register 5/hour per IP, login 10/minute per IP, upload 20/hour per user, feedback 10/hour per user, feedback 200/day shared, delete account 5/hour per user | Single process, per-user keys, no dependency, easy to test with a fake clock. Several rules on one request record the hit together or not at all. The check runs after ownership and status checks, so refused requests cost nothing. State resets on restart. The numbers are placeholders |
| 2026-11-05 | Quotas and capacity: 200 tracks per user, 50 versions per track, 2 active (pending or running) analyses per user, 10 active in total (beyond that 503 `server_busy`), 2 analyses running at once | Analyses run in FastAPI's shared thread pool, so unbounded waiting tasks could starve the API itself. Capacity checks run before the file is written |
| 2026-11-05 | Feedback errors carry the provider code (`not_configured`, `timeout`, `provider_error`, `invalid_output`) in the error envelope | Lets the frontend tell a missing key from a timeout |
| 2026-11-05 | Alembic with a hand-readable baseline migration; every constraint gets a name through a naming convention in `app/db.py`; SQLite migrations use batch mode; the app no longer calls `create_all` and answers a missing schema with a clear startup error | SQLite can only change tables by rebuilding them, which needs constraint names. A test migrates a fresh database and compares it with the models, so a model change without a migration fails. Migrations are run explicitly (`alembic upgrade head`), never automatically on startup |
| 2026-11-11 | Frontend: TypeScript pinned to ~5.9 | openapi-typescript's peer range is ^5 and typescript-eslint supports TypeScript below 6.1, so a newer TypeScript would break the install |
| 2026-11-11 | Frontend: `eslint-plugin-jsx-a11y` skipped | Its peer range stops at ESLint 9 and the project uses ESLint 10. Accessibility is covered by vitest-axe and manual checks instead |
| 2026-11-11 | Frontend: msw pinned to ^2 | API mocks in tests use the MSW 2 API |
| 2026-11-11 | Frontend: HTTP failures are normalised in one custom fetch passed to openapi-fetch (`src/api/client.ts`), not in its middleware | Every failure becomes an `ApiError` with status, code, fields, request id and Retry-After, so callers branch on `error.code` and never on the message |
| 2026-11-11 | Frontend: the login body sends `scope: ''` | The generated type marks `scope` as required although the API defaults it |
| 2026-11-11 | Frontend: Vite `strictPort` on 5173 | The API's CORS list names that port. If Vite silently moved to 5174, every request would fail CORS |
| 2026-11-11 | Frontend: `npm audit` shows 10 moderate issues, all in dev tooling, not yet reviewed | Review in the polish slice, together with the allowScripts warning below |
| 2026-11-11 | Frontend: `npm install` warns that fsevents and msw have install scripts not covered by `allowScripts` | Not decided yet. Review with `npm audit` in the polish slice |
| 2026-11-11 | Frontend (slice 1): no confirm-password field on register | The plan did not include one. Revisit if password typos turn out to be a problem |
| 2026-11-11 | Frontend (slice 1): a wrong-password login shows its own "Incorrect email or password." | The generic copy for `unauthorized` talks about expired sessions, which is wrong on the login form |
| 2026-11-11 | Frontend (slice 1): `returnTo` is sanitised to same-origin paths, never `/login` or `/register` | The query string is user-controlled. Without this, a crafted link would redirect off-site after login |
| 2026-11-11 | Frontend (slice 1): the token store is subscribable and `AuthProvider` reads it with `useSyncExternalStore` | The API client clears the token outside React after a 401, so a copy in React state would go stale |
| 2026-11-11 | Frontend (slice 1): a small `pendingReason` module records why a redirect to login happens (expired, logout, deleted) | The 401 handler and the route guard both redirect and must produce the same URL |
| 2026-11-11 | Frontend (slice 1): if registration works but the automatic sign-in fails, a retry only repeats the sign-in | Registering again would be a 409 |
| 2026-11-11 | Frontend (slice 1): the delete-account dialog uses native `<dialog>`, and Tab leaving it for the browser UI is accepted | Native modal behaviour. A custom focus trap was judged unnecessary |
| 2026-11-11 | Frontend (slice 1): vitest-axe is used through a helper with `color-contrast` and `region` disabled | jsdom has no layout, so contrast cannot be computed. Contrast is checked by hand |
| 2026-11-11 | Frontend (slice 1): `src/test/setup.ts` has a small `showModal` and `close` stand-in for jsdom | jsdom lacks them. The real modal behaviour is checked in a browser |
| 2026-11-11 | Frontend (slice 2): list state is the URL (`q`, `genre`, `tag`, `page`); `limit` is fixed at 20; a filter change goes back to page 1; invalid values fall back to defaults | Links and the back button work. A page past the end is handled by the empty-state rules below |
| 2026-11-11 | Frontend (slice 2): the search and genre fields hold a draft that is written to the URL on submit and reset from the URL when it changes | Typing does not trigger a request per keystroke |
| 2026-11-11 | Frontend (slice 2): previous rows stay and dim while paging (`keepPreviousData`); "empty" and "page does not exist" messages wait for the real answer | No flash of a wrong empty state |
| 2026-11-11 | Frontend (slice 2): there is no `GET /tags`, so chips only show the tags of the tracks on the current page; an active tag filter from the URL is always shown and removable | Revisit with a backend `GET /tags` if a tag picker is needed |
| 2026-11-11 | Frontend (slice 2): tag rules mirror the server (normalised, 30 characters counted as characters, 10 per track); a rejected tag shows an error and is never silently cut | Silent cutting would change what the person typed |
| 2026-11-11 | Frontend (slice 2): PATCH sends only changed fields (compared after trimming, tags as a set); no change means no request; a cleared field sends `null` | Matches the API's PATCH rules |
| 2026-11-11 | Frontend (slice 2): an unknown platform value is kept as an extra "(existing value)" option | Editing never loses a value the form does not know |
| 2026-11-11 | Frontend (slice 2): field limits come from `openapi.json`, not `API.md` (title 200, genre 100, platform 100, notes 5000), counted in characters after trimming, with no native `maxLength` | The server counts the same way, and a native limit would silently cut pasted text |
| 2026-11-11 | Frontend (slice 2): dialogs mount only while open, close through native `close()` so focus returns to the opener, and ignore Esc while a request is in flight; the delete dialog starts with focus on Cancel and a 404 shows an alert and stays open | The form starts fresh every time |
| 2026-11-11 | Frontend (slice 2): all track query keys start with `tracks`; create and update write the returned track into the detail cache and invalidate the lists; delete marks the detail stale without refetching it | Signing out clears the whole cache. A refetch of a deleted track would be a 404 while its page is still on screen |
| 2026-11-11 | Frontend (slice 2): on the detail page a 404 wins over cached data, a non-numeric id shows "not found" without a request, and a created track opens its page | |
| 2026-11-11 | Frontend (slice 2): the track form says notes are never sent to the AI | Matches the backend decision of 2026-11-02 |
| 2026-11-11 | Frontend (slice 2): `SelectField` and `TextAreaField` reuse `TextField`'s stylesheet | Share the stylesheet properly in the polish slice |
| 2026-11-11 | Frontend (slice 2): `handleSubmit` is called inside the submit handler, and the dialog focuses the title field directly in an effect | The `react-hooks/refs` rule forbids passing it straight to JSX, and RHF's `setFocus` did not focus in jsdom |
| 2026-11-11 | Frontend (slice 3): the upload uses `XMLHttpRequest` (`src/api/uploadAnalysis.ts`) because the typed fetch client has no upload progress. Failures go through the same `buildApiError`, and a 401 goes through the shared `notifyUnauthorized()` in `client.ts` | One error shape and one session-expiry path. There is deliberately no timeout, and the caller cancels with an `AbortSignal` |
| 2026-11-11 | Frontend (slice 3): a file is checked before sending (allowed extension, not empty, size against `VITE_MAX_UPLOAD_MB`, default 100 as in the backend) | Saves a pointless upload. The server stays the authority and its 413, 415 and 422 are handled too |
| 2026-11-11 | Frontend (slice 3): in the upload dialog Cancel aborts the request until the whole file is sent, then it is disabled; Esc is ignored while uploading | After 100% the server may already have created the version |
| 2026-11-11 | Frontend (slice 3): `rate_limited`, `too_many_active_analyses` and `server_busy` with a Retry-After disable the submit button with a countdown; other refusals (413, 415, 409 `quota_exceeded`, 422) show one message per code; a 422 that only concerns the label sits on the label field | Branches on `error.code`, never on the message |
| 2026-11-11 | Frontend (slice 3): `useAnalysis` polls every 2 s while the status is `pending` or `running` and stops on `done`, `failed`, unmount and any 4xx. Network errors and 5xx keep polling. `useTrackAnalyses` polls the version list while any version is active | A deleted version would otherwise 404 forever. TanStack Query pauses polling in a hidden tab |
| 2026-11-11 | Frontend (slice 3): version query keys sit under `tracks` in their own branch (`tracks, analyses, ...`). Upload and update write the returned version into the detail cache and invalidate that track's version list; delete marks the detail stale without refetching it | Signing out clears everything. A cached version list of a deleted track is left alone, because the track page shows "not found" first |
| 2026-11-11 | Frontend (slice 3): `/tracks/:id` lists versions oldest first as the server sends them: status, stage, label, file name and date, plus the `error_code` copy for a failed one. After an upload the page stays and announces it | The status updates by itself through polling |
| 2026-11-11 | Frontend (slice 3): known analysis `error_code` values have their own copy; an unknown code shows "The analysis failed (code)"; the three "tool missing" codes say it is not the file's fault | More codes may exist. Showing the code lets it be reported |
| 2026-11-11 | Frontend (slice 3): the version page `/analyses/:id` shows status and details, edits stage and label (only changed fields, a cleared field sends `null`, no change means no request) and deletes after a confirm dialog, then returns to the track. Metrics and feedback are slice 4 | A 404 wins over cached data and a non-numeric id shows "not found" without a request |
| 2026-11-11 | Frontend (slice 3): the waveform uses `wavesurfer.js` 8.0.5, loaded lazily, drawn from the `File` chosen in the upload dialog and kept only in tab memory (`sessionFiles.ts`). It is dropped on reload, on sign-out or a 401, and when the version is deleted | The server never keeps the audio. The page says so when no file is available, and also when the browser cannot decode the file |
| 2026-11-11 | Frontend (slice 3): the waveform has a Play/Pause button; seeking works with the mouse only; colours are read once from the CSS tokens when the player is created | Keyboard seeking and repainting on a theme change are polish items |
| 2026-11-11 | Frontend (slice 3): tests replace XMLHttpRequest with a small fake for upload progress and abort, and replace wavesurfer with a fake. Polling tests use real timers with a 20 ms interval | jsdom plus MSW is not reliable for upload progress, and wavesurfer cannot run in jsdom. The real upload and drawing are browser checks |

## Design principles

- Measure with DSP, explain with the LLM. The LLM only receives the metrics JSON (`schema/metrics.schema.json`) plus the user's context (genre, target platform, stage). It never "listens" to audio and must not invent measurements.
- Analysis code is pure and framework-free so the measurements could later be reimplemented in C++/JUCE against the same schema.
- BPM and key are suggestions and always carry a confidence value.
- Uploaded audio is deleted after analysis unless the user saves the track.

## Open questions

- Is essentia accurate enough for BPM and key on real tracks, and does `edma` or `bgate` suit the genres you work in? First track: BPM 123.7 vs 124, key correct. Second track (the example track): BPM 128 correct at confidence 0.54, key not yet verified. Test 5-10 more with known values, including a half-time one, and log the results here.
- Loudness, LRA and true peak are verified against Youlean, the DAW meter, SPAN and WLM on one track (2026-11-02): integrated -10.4 vs -10.3/-10.5 LUFS, short-term max -8.3 vs -8.3, momentary max -7.8 vs -7.7/-7.8, LRA 4.3 vs 4.3, true peak +1.2 vs +1.2 to +1.3. An earlier comparison used an older render of the file and is void. Still to check: spectrum bands, stereo width and correlation, and RMS (ours -12.07 vs SPAN -13.6/-13.7 live readout). DR is not comparable (different definitions).
- Set `RATE_LIMIT_FEEDBACK_GLOBAL` from the actual Gemini free-tier quota (the 200/day default is a guess), and review the other rate-limit and quota numbers once the frontend exists and real usage is visible.
- Deployment: where it will run, which reverse proxy enforces the body limit, and whether a single process is still enough (the rate limiter, analysis slots and background tasks all assume one).
- Database: SQLite to start; move to Postgres only if needed.
- File retention: audio is deleted after analysis, only metrics are kept. Decide whether stored metrics and feedback should expire.

## Frontend: manual checks and polish (open)

Checks that jsdom cannot do, to run in a browser against the running API:

- A real upload: the CORS preflight for the XHR (the `Authorization` header), `Retry-After` readable on a 429, the progress bar, and the version moving from pending through running to done at the 2 s pace.
- Native dialog behaviour: modal focus, Esc, focus returning to the opener.
- A VoiceOver check of the "Error:" prefix on field errors.
- Contrast, in light and dark: the dimmed list while paging, tag chips and the filled active chip, muted hint text, the progress bar, status badges and the failure text.
- The waveform: it draws and plays, a large file (a 100 MB WAV is decoded fully in memory), an AIFF in Chrome (expect the "could not draw" message), and the colours after a system theme switch.
- The narrow layout of the version rows.
- The track list once with more than 20 tracks, to see the dimmed state.

Polish tasks:

- One shared "describe failure" helper: `TrackFormDialog`, `DeleteTrackDialog` and `describeFailureWithWait` in `features/analyses` repeat it. Share the field stylesheet instead of importing it from `TextField`.
- Share the stage and status text and the stage options (`features/analyses/labels.ts`) with `TrackVersions` and `UploadVersionDialog`, which still carry their own copies.
- Check the label length limit in `openapi.json` and add it to the upload and edit dialogs if there is one. Check how `request_limits.py` turns `MAX_UPLOAD_MB` into bytes (1 MB = 1024 × 1024 is assumed).
- Keyboard seeking for the waveform.
- Optionally stub `HTMLCanvasElement.getContext` in `setup.ts` to silence the axe notices.
- Sanitized test fixtures (the real samples stay in `frontend/src/test/fixtures/private/`, git-ignored, as is `*.wav`).
- Review `npm audit` and the `allowScripts` warning.
- A backend script to dump `openapi.json`, if a type the generated client lacks is needed.

Later slices: 4 results (metrics cards, hand-written SVG spectrum chart with a hidden data table, honest labelling: dynamic range is an approximation, not DR14; tempo and key are suggestions with confidence; feedback cards with generate and regenerate), 5 polish and docs.
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
| 2026-10-26 | Claude Chat for planning, Claude Code for building in the repo | `CLAUDE.md` at the repo root carries the project context |
| 2026-10-26 | ~~Backend in TypeScript with essentia.js~~ | Superseded below |
| 2026-10-26 | **Python analysis + FastAPI API + React/TypeScript frontend** | Supersedes the TypeScript backend. Reasons: the goal is audio AI/plugin work, where Python (essentia, numpy, ML tooling) is the norm for analysis; essentia runs natively instead of through WebAssembly; one backend language is faster to build in 4 weeks. FastAPI chosen over ASP.NET Core to keep a single backend |
| 2026-10-27 | Spectrum bands are pink-referenced: energy per octave, relative to the average across bands | Pink noise reads 0 dB everywhere; real music slopes down, so compare against genre reference curves |
| 2026-10-27 | `dynamic_range_db` is an approximation of the DR-meter idea: per channel, second-highest 3 s block peak vs RMS of the loudest 20% of blocks | Not a certified DR14 reading; label it as approximate in the UI |
| 2026-10-27 | Stereo `width` = share of energy in the side signal (0 mono, 0.5 unrelated channels, 1 inverted); `mono_compatible` = average correlation above -0.1 | Simple definitions; revisit if they disagree with a reference meter |
| 2026-10-27 | Spectrum, stereo and dynamics use the first 600 s decoded at 44.1 kHz; tempo and key the first 240 s | A warning is added to the result when a file is truncated |

## Design principles

- Measure with DSP, explain with the LLM. The LLM only receives the metrics JSON (`schema/metrics.schema.json`) plus the user's context (genre, target platform, stage). It never "listens" to audio and must not invent measurements.
- Analysis code is pure and framework-free so the measurements could later be reimplemented in C++/JUCE against the same schema.
- BPM and key are suggestions and always carry a confidence value.
- Uploaded audio is deleted after analysis unless the user saves the track.

## Open questions

- Is essentia accurate enough for BPM and key on real tracks, and does `edma` or `bgate` suit the genres you work in? First track: BPM 123.7 vs 124, key correct. Test 5-10 more with known values, including a half-time one, and log the results here.
- Do the spectrum, stereo and DR values agree with a reference meter or plugin you trust? Spot-check a few tracks.
- CRUD scope (the bootcamp emphasizes CRUD): proposed entities are Track (title, genre, target platform, notes, tags) and Analysis (one per uploaded version), plus optional users/auth. Confirm before building the API.
- Database: SQLite to start; move to Postgres only if needed.
- File retention policy and upload size limits.

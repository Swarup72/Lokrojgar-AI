# LokRozgar AI Service

Stateless FastAPI service that centralizes **all** AI processing for the
LokRozgar platform:

- **Recommendation**: skill, location, availability, pay, rating, and
  relevance matching, weighted ranking, and deterministic explanations.
- **Voice**: speech-to-text transcription (provider-independent — local
  Whisper by default, Sarvam AI available as an alternate/fallback provider)
  and structured worker-profile extraction from a voice recording (still
  backed by Sarvam AI — not migrated yet).
- **Translation**: translating job-posting text into all three app
  languages (mr/hi/en), backed by Sarvam AI.

Recommendation is the **production, authoritative** matching engine — the
legacy JavaScript matcher in `../backend2/src/services/matching.service.js`
has been fully cut over and is no longer called by any production route or
controller. It remains in the repository as legacy/reference code only
(not deleted yet), still covered by its own pre-existing unit test in
`../backend2/tests/api.test.js`, but nothing in production depends on it.

Voice and Translation were previously implemented directly inside Node
(calling the Sarvam SDK from `ai.service.js`/`translation.service.js`);
that logic now lives here instead, reached from Node through the same thin
`aiService.client.js` HTTP client already used for recommendations. Node's
wrappers keep their exact original function signatures and only change how
they get their answer — an HTTP call instead of a direct SDK call.

This service owns no database. MongoDB is owned exclusively by the
Node/Express backend (`../backend2`) — Node fetches `WorkerProfile`,
`WorkerSkill`, and `Job` data (or an audio file / text to translate) and
sends it here, and this service returns the result. Python never connects
to MongoDB and never sees MongoDB credentials.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # then fill in AI_SERVICE_API_KEY / SARVAM_API_KEY if desired
```

`requirements.txt` includes `torch` and `openai-whisper` for local STT — this
is a real (~2-3 GB with model weights) install, not optional even if you plan
to only use Sarvam, since `app/voice/transcription.py` imports both provider
modules unconditionally. Transcription also shells out to `ffmpeg` to decode
whatever container the audio arrives in (webm/wav/m4a/mp3) — install it
separately (`brew install ffmpeg` on macOS) if it isn't already on `PATH`.
The first real transcription downloads the selected Whisper model
(`small` ≈ 461 MB) into `~/.cache/whisper/` and caches it there permanently;
every subsequent call reuses the cached file with no network access.

## Run

```bash
.venv/bin/uvicorn app.main:app --reload --port 8000
```

## Test

```bash
.venv/bin/pytest
```

For the real Node → FastAPI → Python round trip (not part of the default
Python or Node test commands — see `../backend2/tests/integration/`):

```bash
.venv/bin/uvicorn app.main:app --port 8000 &
cd ../backend2 && node --test tests/integration/aiService.integration.test.js
```

## Endpoints

| Endpoint | Purpose | Called from Node by |
|---|---|---|
| `GET /health` | Liveness check, unauthenticated | — |
| `POST /recommendations/jobs-for-worker` | One worker + candidate jobs → ranked, explained jobs | `getRecommendedJobsForWorker()` in `job.controller.js::getRecommendedJobs` (`GET /api/v1/jobs/recommended`) |
| `POST /recommendations/workers-for-job` | One job + candidate workers → ranked, explained workers | `getRecommendedWorkersForJob()` in `job.controller.js::getRecommendedWorkers` (`GET /api/v1/jobs/:jobId/recommended-workers`) |
| `POST /recommendations/score-pair` | Score exactly one worker/job pair (no top-K, no candidate filtering) | `scoreWorkerJobPair()` in `application.controller.js::applyForJob` |
| `POST /voice/extract` | Transcribe a voice recording (`multipart/form-data`: `audio` file + `language` field) and extract a structured worker profile from it | `forwardAudioForExtraction()` in `ai.service.js`, from `voiceProfile.controller.js` |
| `POST /translation/translate` | Translate `text` into all three app languages (`mr`/`hi`/`en`) | `translateText()` in `translation.service.js`, from job creation/update |

The three `/recommendations/*` endpoints accept the existing domain models
(`WorkerProfile`, `WorkerSkill`, `Job`, `RankingWeights`) directly as
request-body fields — nothing is duplicated into separate API-only schemas.
`jobs-for-worker` and `workers-for-job` return a list of matches;
`score-pair` returns a single match. Every match carries the full
`RankingResult` (`overall_score`, `match_factors`, `available_factors`,
`unavailable_factors`) plus a `MatchExplanation` — `match_factors.pay`/
`.rating` are `null`, never `0`, whenever that factor couldn't be computed.

`/translation/translate` and profile extraction (the second half of
`/voice/extract`) are backed by Sarvam AI (`SARVAM_API_KEY` in `.env`). If
the key is unset, both return `503` rather than producing simulated data —
Node's wrappers decide what to do with that (translation falls back to
source-language passthrough; voice extraction propagates the failure to the
caller). The transcription half of `/voice/extract` uses whichever provider
`STT_PROVIDER` selects — see **Speech-to-text (STT)** below; it does not
depend on `SARVAM_API_KEY` unless `STT_PROVIDER=sarvam`.

## Speech-to-text (STT)

Transcription is provider-independent behind an `STTProvider` interface
(`app/voice/interface.py`), so `app/api/voice.py` and Node never know or
care which engine actually did the transcription:

```
app/voice/
├── interface.py       STTProvider ABC: async transcribe(audio_bytes, filename,
│                       content_type, language) -> (transcript, confidence)
├── whisper_stt.py      WhisperSTT - local, offline, the default provider
├── sarvam_stt.py        SarvamSTT - Sarvam AI's cloud STT, kept available
└── transcription.py    get_stt_provider()/transcribe_audio() - reads
                        STT_PROVIDER fresh on every call and dispatches
```

**Provider selection** — set in `.env`, no code change needed:

| Env var | Values | Default | Meaning |
|---|---|---|---|
| `STT_PROVIDER` | `whisper` \| `sarvam` | `whisper` | Which engine transcribes audio. An unrecognized value raises `AiServiceUnavailableError` (a typo should surface loudly, not silently fall back). |
| `WHISPER_MODEL` | any Whisper model name (`tiny`/`base`/`small`/`medium`/`large`...) | `small` | Only used when `STT_PROVIDER=whisper`. |
| `WHISPER_DEVICE` | `auto` \| `cpu` \| `mps` | `auto` | `auto`/`mps` use Apple Silicon's MPS backend when available and fall back to `cpu` automatically — the app never fails to start or fails a request just because MPS is unavailable (e.g. on Linux/CI/Intel Mac). |
| `WHISPER_FP16` | `true` \| `false` | `false` | Half-precision inference. Whisper's own code already forces this off on CPU regardless of this setting. |

`STT_PROVIDER=sarvam` is kept working as a fallback/comparison option, still
using `SARVAM_API_KEY` and the existing `saaras:v3` model — no behavior
change from before this migration when selected explicitly.

**Model choice**: `small` was chosen as the default over `tiny`/`base`
because Marathi and Hindi accuracy degrade noticeably on the smaller models
in informal testing, and over `medium`/`large` because those are
multi-gigabyte downloads and noticeably slower per request on a laptop CPU —
`small` was the practical accuracy/speed/disk tradeoff for local
development. This is an implementation choice, not a project requirement —
change `WHISPER_MODEL` freely if a different tradeoff is needed.

**Apple Silicon (M2) behavior, as actually observed on this machine**: MPS
is available (`torch.backends.mps.is_available()` → `True`) and is used by
default. If an MPS inference call raises a `RuntimeError` (some ops aren't
implemented for MPS in every PyTorch version), `WhisperSTT` automatically
retries once on CPU rather than failing the request — this was exercised
directly (not just unit-tested) during manual verification.

**Language handling**: `language` is a *hint*, not a constraint — Whisper is
always called with `task="transcribe"` (never `"translate"`), and an
unrecognized/`"auto"` language hint is passed through as `None` so Whisper
auto-detects rather than being forced into a wrong language. Whisper's own
language codes (`mr`/`hi`/`en`) are used directly — no BCP-47-style mapping
like Sarvam's `mr-IN`/`hi-IN`/`en-IN` is needed.

**Marathi/Hindi/English + code-switching — actual observed results**
(manual testing via `scripts/test_whisper.py` with real synthesized speech,
`WHISPER_MODEL=small`, `WHISPER_DEVICE=auto`/MPS): single-language Marathi,
Hindi, and English audio all transcribed correctly. Code-switched audio gave
genuinely mixed results, reported honestly rather than rounded up:

- Hindi+English (hint `hi`): English words were preserved correctly in Latin
  script (e.g. "I have 5 years experience as a plumber"), though trailing
  Hindi speech was inconsistently romanized rather than kept in Devanagari.
- Marathi+English (hint `mr`) and trilingual Marathi+Hindi+English (hint
  `auto`): English portions were garbled into nonsensical pseudo-Devanagari
  transliteration instead of being preserved as English.

This is inherent Whisper behavior under code-switching with these language
hints, not a bug in the provider implementation — no fix was attempted for
it here. Do not assume production-quality code-switching accuracy without
further evaluation. (No Marathi TTS voice was available on the test machine
for synthesizing audio, so Marathi-involving tests used a Hindi voice
reading Marathi script as the closest available approximation — an audio-
source limitation, not a Whisper limitation.)

Unlike Sarvam (`language_probability`), Whisper exposes no comparable
per-transcript confidence score — `WhisperSTT.transcribe()` always returns
`confidence=None` rather than fabricating one.

**Manual real-model test** (not part of `pytest` — that suite only ever
mocks `whisper.load_model`, per the project rule that automated tests must
never download a real model or depend on real audio):

```bash
.venv/bin/python scripts/test_whisper.py path/to/audio.wav [mr|hi|en]
```

## Authentication

If `AI_SERVICE_API_KEY` is set in the environment, all POST endpoints
require a matching `X-AI-Service-Key` header (missing or wrong → 401). If
it's unset, requests are allowed without a key — intended for local
development only, not for a real deployment. `/health` is always
unauthenticated.

## Project layout

```
app/
├── api/             FastAPI routers - HTTP boundary only, no scoring/AI-provider logic
├── models/          Pydantic models mirroring the backend2 Mongoose schemas
├── matching/         Six independent pairwise matchers (skill/location/availability/pay/rating/relevance)
├── ranking/          MatchFactors aggregation into one overall score
├── recommendation/   Orchestration: candidate filtering, pair scoring, top-K, explanations
├── sarvam/           Shared Sarvam AI client (model config, retry helper, error types)
├── voice/            Provider-independent STT (interface.py, whisper_stt.py,
│                     sarvam_stt.py, transcription.py dispatcher) - see
│                     "Speech-to-text (STT)" above
├── extraction/       Structured worker-profile extraction from a transcript
├── translation/      Job-text translation into mr/hi/en
└── main.py           FastAPI app instance + router registration only
```

`app/matching/`, `app/ranking/`, and `app/recommendation/` are the single
source of truth for how a match is scored — the API layer only calls into
them, it never recalculates anything itself. `app/voice/` (transcription),
`app/extraction/`, and `app/translation/` are the single source of truth for
speech/AI-provider usage — Node never calls Whisper or Sarvam directly. In
both cases, `Node` only serializes data, calls this service, and
persists/returns whatever comes back.

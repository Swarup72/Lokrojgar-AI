# LokRozgar AI Service

Stateless FastAPI service that centralizes **all** AI processing for the
LokRozgar platform:

- **Recommendation**: skill, location, availability, pay, rating, and
  relevance matching, weighted ranking, and deterministic explanations.
- **Voice**: speech-to-text transcription and structured worker-profile
  extraction from a voice recording, backed by Sarvam AI.
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

`/voice/extract` and `/translation/translate` are backed by Sarvam AI
(`SARVAM_API_KEY` in `.env`). If the key is unset, both return `503` rather
than producing simulated data — Node's wrappers decide what to do with that
(translation falls back to source-language passthrough; voice extraction
propagates the failure to the caller).

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
├── voice/            Speech-to-text transcription
├── extraction/       Structured worker-profile extraction from a transcript
├── translation/      Job-text translation into mr/hi/en
└── main.py           FastAPI app instance + router registration only
```

`app/matching/`, `app/ranking/`, and `app/recommendation/` are the single
source of truth for how a match is scored — the API layer only calls into
them, it never recalculates anything itself. `app/voice/`, `app/extraction/`,
and `app/translation/` are the single source of truth for Sarvam AI usage —
Node never calls Sarvam directly. In both cases, `Node` only serializes
data, calls this service, and persists/returns whatever comes back.

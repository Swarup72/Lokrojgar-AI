/**
 * Thin HTTP client for the Python AI service (../../ai-service).
 *
 * This file does NOT calculate anything - it only forwards data to
 * FastAPI and returns whatever it responds with. All matching/ranking/
 * explanation logic lives in the Python service; this client's only job
 * is the HTTP call.
 *
 * Uses Node's built-in fetch() - no axios, no new dependency.
 */

// Port 8001, because 8000 is the NODE backend's own port (see .env.example's
// PORT=8000). The old default had an unconfigured deployment pointing this
// service client back at the Node server, and it is why the AI integration test
// needed AI_SERVICE_URL overridden by hand to pass. The runtime architecture is
// unchanged - .env already used 8001; this makes the fallback agree with it.
const getBaseUrl = () => process.env.AI_SERVICE_URL || "http://localhost:8001";
const getApiKey = () => process.env.AI_SERVICE_API_KEY || "";

// Every AI-service call gets a finite timeout, so a hung FastAPI process
// can't leave the Node request (and the user behind it) waiting forever.
// Two budgets, because the endpoints fall into two very different groups:
//  - scoring/recommendations/translation: pure computation or one external
//    call, normally well under a second or two.
//  - local-model inference (/voice/extract = MLX Whisper + local LLM,
//    /skills/resolve = local LLM): measured 15-90s per request locally, and
//    requests are not serialized, so concurrent ones take longer.
// These are hang backstops, not performance targets - both are env-tunable.
export const DEFAULT_AI_SERVICE_TIMEOUT_MS = 30_000;
export const DEFAULT_AI_SERVICE_INFERENCE_TIMEOUT_MS = 300_000;

const readTimeoutMs = (envName, fallback) => {
  const value = Number(process.env[envName]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const getAiServiceTimeoutMs = () =>
  readTimeoutMs("AI_SERVICE_TIMEOUT_MS", DEFAULT_AI_SERVICE_TIMEOUT_MS);
export const getAiServiceInferenceTimeoutMs = () =>
  readTimeoutMs("AI_SERVICE_INFERENCE_TIMEOUT_MS", DEFAULT_AI_SERVICE_INFERENCE_TIMEOUT_MS);

/**
 * Thrown when an AI-service call exceeds its timeout. Deliberately carries
 * no .statusCode - exactly like an unreachable service - so every existing
 * caller keeps treating it as "AI service unavailable" (503 / translation
 * fallback / skill left unresolved) with no caller changes, while
 * `isTimeout` still lets it be told apart from other failures.
 */
export class AiServiceTimeoutError extends Error {
  constructor(path, timeoutMs) {
    super(`AI service request to ${path} timed out after ${timeoutMs}ms`);
    this.name = "AiServiceTimeoutError";
    this.isTimeout = true;
    this.path = path;
    this.timeoutMs = timeoutMs;
  }
}

// The same AbortSignal covers the whole exchange - connecting, waiting for
// headers, and reading the body - so a server that sends headers and then
// stalls mid-body is still cut off.
async function fetchWithTimeout(path, options, timeoutMs) {
  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await handleAiServiceResponse(response, path);
  } catch (error) {
    if (error?.name === "TimeoutError") {
      throw new AiServiceTimeoutError(path, timeoutMs);
    }
    throw error;
  }
}

async function handleAiServiceResponse(response, path) {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(
      errorBody.detail || `AI service request to ${path} failed with status ${response.status}`
    );
    error.statusCode = response.status;
    throw error;
  }

  return response.json();
}

async function postToAiService(path, payload, timeoutMs = getAiServiceTimeoutMs()) {
  const headers = { "Content-Type": "application/json" };
  const apiKey = getApiKey();
  if (apiKey) {
    headers["X-AI-Service-Key"] = apiKey;
  }

  return fetchWithTimeout(path, { method: "POST", headers, body: JSON.stringify(payload) }, timeoutMs);
}

/**
 * Same as postToAiService, but for multipart/form-data bodies (file
 * uploads). No Content-Type header is set here - fetch() sets it itself,
 * including the multipart boundary, when the body is a FormData instance.
 */
async function postMultipartToAiService(path, formData, timeoutMs = getAiServiceTimeoutMs()) {
  const headers = {};
  const apiKey = getApiKey();
  if (apiKey) {
    headers["X-AI-Service-Key"] = apiKey;
  }

  return fetchWithTimeout(path, { method: "POST", headers, body: formData }, timeoutMs);
}

/**
 * @param {object} params
 * @param {object} params.worker - WorkerProfile document (as fetched from Mongo)
 * @param {object[]} [params.workerSkills] - that worker's WorkerSkill rows
 * @param {object[]} params.jobs - candidate Job documents
 * @param {object} [params.weights] - optional RankingWeights override
 * @param {number} [params.topK]
 */
export const getRecommendedJobsForWorker = ({
  worker,
  workerSkills = [],
  jobs,
  weights,
  topK,
}) => {
  return postToAiService("/recommendations/jobs-for-worker", {
    worker,
    worker_skills: workerSkills,
    jobs,
    weights,
    top_k: topK,
  });
};

/**
 * @param {object} params
 * @param {object} params.job - Job document
 * @param {object[]} params.workers - candidate WorkerProfile documents
 * @param {object[]} [params.workerSkills] - WorkerSkill rows for those workers (bulk, unfiltered)
 * @param {object} [params.weights]
 * @param {number} [params.topK]
 */
export const getRecommendedWorkersForJob = ({
  job,
  workers,
  workerSkills = [],
  weights,
  topK,
}) => {
  return postToAiService("/recommendations/workers-for-job", {
    job,
    workers,
    worker_skills: workerSkills,
    weights,
    top_k: topK,
  });
};

/**
 * Score exactly one worker/job pair - a thin wrapper around FastAPI's
 * /recommendations/score-pair, which itself is a thin wrapper around the
 * existing score_worker_job_pair(). Used by applyForJob to replace the
 * legacy matching.service.js calculation.
 *
 * @param {object} params
 * @param {object} params.worker - WorkerProfile document
 * @param {object[]} [params.workerSkills] - that worker's WorkerSkill rows
 * @param {object} params.job - Job document
 * @param {object} [params.weights]
 * @returns {Promise<{worker_id: string, job_id: string, ranking: object, explanation: object}>}
 */
export const scoreWorkerJobPair = ({ worker, workerSkills = [], job, weights }) => {
  return postToAiService("/recommendations/score-pair", {
    worker,
    worker_skills: workerSkills,
    job,
    weights,
  });
};

/**
 * Forward a voice recording to FastAPI's /voice/extract for transcription +
 * structured profile extraction. Sends the already-read file bytes as
 * multipart/form-data - this client does not touch the filesystem itself.
 *
 * @param {object} params
 * @param {Buffer} params.audioBuffer - full contents of the audio file
 * @param {string} params.filename
 * @param {string} params.contentType
 * @param {string} params.language
 * @returns {Promise<{transcript: string, extracted_profile: object, confidence: number|null}>}
 */
export const forwardAudioForExtraction = ({ audioBuffer, filename, contentType, language }) => {
  const formData = new FormData();
  formData.append("audio", new Blob([audioBuffer], { type: contentType }), filename);
  formData.append("language", language);

  return postMultipartToAiService("/voice/extract", formData, getAiServiceInferenceTimeoutMs());
};

/**
 * One guided step: transcribe a short recording and extract a SINGLE field from
 * it, via FastAPI's /voice/extract-field.
 *
 * Shares the transcription path, the frozen Whisper configuration and the
 * number-grounding guard with forwardAudioForExtraction above. The difference is
 * what happens after transcription: only `field: "skills"` reaches the language
 * model, so a whole guided session makes exactly one Qwen call. Every other field
 * is parsed deterministically on the Python side.
 *
 * @param {object} params
 * @param {Buffer} params.audioBuffer
 * @param {string} params.filename
 * @param {string} params.contentType
 * @param {string} params.language - the language the worker SPOKE in
 * @param {string} params.field - fullName | expectedPay | experienceYears | city | skills
 * @returns {Promise<{field:string, transcript:string, value:any, ok:boolean, reason:string, candidates:number[], confidence:number|null, used_llm:boolean}>}
 */
export const forwardAudioForFieldExtraction = ({ audioBuffer, filename, contentType, language, field }) => {
  const formData = new FormData();
  formData.append("audio", new Blob([audioBuffer], { type: contentType }), filename);
  formData.append("language", language);
  formData.append("field", field);

  return postMultipartToAiService("/voice/extract-field", formData, getAiServiceInferenceTimeoutMs());
};

/**
 * Translate text into all three app languages via FastAPI's
 * /translation/translate.
 *
 * @param {object} params
 * @param {string} params.text
 * @param {string} params.sourceLang
 * @returns {Promise<{mr: string, hi: string, en: string}>}
 */
export const translateText = ({ text, sourceLang }) => {
  return postToAiService("/translation/translate", { text, source_lang: sourceLang });
};

/**
 * Stage 2 semantic skill resolution via FastAPI's /skills/resolve - only
 * called for raw skill phrases Node's own deterministic normalization
 * (utils/skillNormalization.js, Stage 1) could not already resolve by
 * exact multilingual name match or a known alias. The local LLM selects
 * only from the `catalog` entries actually supplied - it never invents a
 * skill or an id.
 *
 * @param {object} params
 * @param {string} params.transcript - full voice transcript, for context only
 * @param {string[]} params.rawSkills - unresolved raw skill phrases
 * @param {{id: string, name: {mr:string, hi:string, en:string}}[]} params.catalog - active Skill catalog entries
 * @returns {Promise<{results: {rawSkill:string, resolved:boolean, canonicalSkillId:string|null, canonicalSkillName:string|null, confidence:number, reason:string}[]}>}
 */
export const resolveSkillsSemantically = ({ transcript, rawSkills, catalog }) => {
  return postToAiService("/skills/resolve", { transcript, rawSkills, catalog }, getAiServiceInferenceTimeoutMs());
};

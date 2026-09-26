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

const getBaseUrl = () => process.env.AI_SERVICE_URL || "http://localhost:8000";
const getApiKey = () => process.env.AI_SERVICE_API_KEY || "";

async function postToAiService(path, payload) {
  const headers = { "Content-Type": "application/json" };
  const apiKey = getApiKey();
  if (apiKey) {
    headers["X-AI-Service-Key"] = apiKey;
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

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

import client from "./client";

/**
 * Worker only. Returns null (not a rejection) when the worker has no
 * WorkerProfile yet - a real, expected state.
 * @returns {Promise<{job:object, matchScore:number|null, matchFactors:object}[]|null>}
 */
export function getRecommendedJobs() {
  return client
    .get("/jobs/recommended")
    .then((res) => res.data.data)
    .catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
}

/**
 * Employer only (must own the job).
 * @returns {Promise<{worker:object, matchScore:number|null, matchFactors:object}[]>}
 */
export function getRecommendedWorkers(jobId) {
  return client.get(`/jobs/${jobId}/recommended-workers`).then((res) => res.data.data);
}

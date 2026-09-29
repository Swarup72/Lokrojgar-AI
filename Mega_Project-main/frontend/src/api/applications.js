import client from "./client";

/**
 * Worker only. `coverNote` is accepted by the backend but is not a real
 * schema field on Application - it is silently dropped, never persisted.
 * The job must be status exactly "open" (a partially_assigned job cannot
 * receive new applications even though it can appear in recommendations).
 */
export function apply({ jobId, coverNote }) {
  return client.post("/applications/apply", { jobId, coverNote }).then((res) => res.data.data);
}

export function withdraw(applicationId) {
  return client.post(`/applications/${applicationId}/withdraw`).then((res) => res.data.data);
}

/** Worker only. Unpaginated; each application's `jobId` is populated with the full Job doc. */
export function getMine() {
  return client.get("/applications/mine").then((res) => res.data.data);
}

/** Employer only (must own the job). Unpaginated; sorted server-side by matchScore desc. */
export function getForJob(jobId) {
  return client.get(`/applications/job/${jobId}`).then((res) => res.data.data);
}

export function shortlist(applicationId) {
  return client.patch(`/applications/${applicationId}/shortlist`).then((res) => res.data.data);
}

/** @param {"accepted"|"rejected"} status */
export function setStatus(applicationId, status) {
  return client.patch(`/applications/${applicationId}/status`, { status }).then((res) => res.data.data);
}

export function complete(applicationId) {
  return client.patch(`/applications/${applicationId}/complete`).then((res) => res.data.data);
}

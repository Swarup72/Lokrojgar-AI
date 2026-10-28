import client from "./client";

/**
 * Worker only. The job must be status exactly "open" (a partially_assigned job
 * cannot receive new applications even though it can appear in
 * recommendations).
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

export function getById(applicationId) {
  return client.get(`/applications/${applicationId}`).then((res) => res.data.data);
}

// --- Employer-initiated hiring ("job requests") -----------------------------
//
// An employer's request and a worker's application are the SAME Application
// document, distinguished by `initiatedBy` and the `invited` status. There is
// one hiring path, so a request cannot over-hire a job or coexist with an
// application for the same pair.

/**
 * Employer only (must own the job). `workerId` is the WorkerProfile id as the
 * recommended-workers list returns it; the employer is taken from the token.
 * 409 if this worker already has an application/request for the job.
 * @param {{jobId:string, workerId:string, proposedPay?:number}} payload
 */
export function invite(payload) {
  return client.post("/applications/invite", payload).then((res) => res.data.data);
}

/** Worker only. Incoming job requests, newest first, with the job populated. */
export function getInvitations() {
  return client.get("/applications/invitations").then((res) => res.data.data);
}

/**
 * Worker only, and only for a request addressed to them. Accepting goes through
 * the same atomic capacity reservation as an employer accepting an application,
 * so a full job returns 400 rather than over-hiring.
 * @param {"accepted"|"declined"} response
 */
export function respondToInvitation(applicationId, response) {
  return client
    .post(`/applications/${applicationId}/respond`, { response })
    .then((res) => res.data.data);
}

import client, { AI_REQUEST_TIMEOUT_MS } from "./client";

/**
 * Public. NOTE: intentionally no "search" keyword param - the backend
 * accepts one but never applies it (confirmed dead), so exposing a text
 * search box here would promise functionality that silently does nothing.
 * Each job comes back populated (categoryId/skillIds/employerId) plus
 * server-localized `titleText`/`descriptionText` convenience fields.
 * @param {{page?:number, limit?:number, categoryId?:string, payType?:string, minPay?:number, status?:string}} params
 * @returns {Promise<{docs:object[], totalDocs:number, page:number, limit:number, totalPages:number, hasPrevPage:boolean, hasNextPage:boolean, prevPage:number|null, nextPage:number|null}>}
 */
export function search(params = {}) {
  return client.get("/jobs/search", { params }).then((res) => res.data.data);
}

/**
 * Public. Real "near me" filter - not a substitute for keyword search.
 * Returns a bare, unpaginated array (server caps at 50). Unlike `search()`,
 * these jobs are NOT populated - `categoryId`/`skillIds`/`employerId` are
 * raw ObjectId strings, and each job carries a `distanceMeters` field from
 * the $geoNear aggregation.
 */
export function nearby({ longitude, latitude, radiusKm }) {
  return client.get("/jobs/nearby", { params: { longitude, latitude, radiusKm } }).then((res) => res.data.data);
}

/** Employer only. Unpaginated - returns every job the employer has ever posted. */
export function getEmployerMine() {
  return client.get("/jobs/employer/mine").then((res) => res.data.data);
}

/**
 * The backend's createJobValidator (Zod) requires `title`/`description` to
 * already be `{mr?,hi?,en?}` objects, NOT plain strings - a single-language
 * post should be shaped as e.g. `{title: {en: "Plumber needed"}}` with
 * `originalLanguage: "en"`. The controller then auto-translates that one
 * populated key into the other two languages server-side.
 * @param {{title:{mr?:string,hi?:string,en?:string}, description?:{mr?:string,hi?:string,en?:string}, originalLanguage:string, categoryId:string, skillIds?:string[], city?:string, address?:string, coordinates:[number,number], payType:string, payAmount:number, requiredWorkers:number, startDate:string, experienceRequired?:number, preferredLanguages?:string[], shiftType?:string, startTime?:string, endTime?:string}} payload
 */
export function create(payload) {
  // Long timeout: creation waits on two AI-service translations. Timing out
  // in the browser while the server still saves the job would invite a
  // duplicate post from the user.
  return client.post("/jobs", payload, { timeout: AI_REQUEST_TIMEOUT_MS }).then((res) => res.data.data);
}

export function getById(jobId) {
  return client.get(`/jobs/${jobId}`).then((res) => res.data.data);
}

export function update(jobId, payload) {
  return client
    .patch(`/jobs/${jobId}`, payload, { timeout: AI_REQUEST_TIMEOUT_MS })
    .then((res) => res.data.data);
}

export function cancel(jobId) {
  return client.post(`/jobs/${jobId}/cancel`).then((res) => res.data.data);
}

export function close(jobId) {
  return client.post(`/jobs/${jobId}/close`).then((res) => res.data.data);
}

export function reopen(jobId, payload = {}) {
  return client.post(`/jobs/${jobId}/reopen`, payload).then((res) => res.data.data);
}

export function remove(jobId) {
  return client.delete(`/jobs/${jobId}`).then((res) => res.data.data);
}

export function updateStatus(jobId, status) {
  return client.patch(`/jobs/${jobId}/status`, { status }).then((res) => res.data.data);
}

/**
 * Worker only, and only once their application or job request for this job has
 * been ACCEPTED - otherwise 403 with a message explaining when it unlocks.
 *
 * Before acceptance a worker already has the employer's display name and the
 * job's own location from the ordinary job read; this adds the phone number and
 * the employer's own location. Returns
 * `{employerName, businessName, businessType, phone, city, village, employerLocation, isVerified}`.
 */
export function getEmployerContact(jobId) {
  return client.get(`/jobs/${jobId}/employer-contact`).then((res) => res.data.data);
}

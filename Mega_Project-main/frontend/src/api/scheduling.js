import client from "./client";

/** Worker only: fetch own weekly availability & exceptions. */
export function getMyAvailability() {
  return client.get("/workers/me/availability").then((res) => res.data.data);
}

/**
 * Worker only: update weekly working hours.
 * @param {{timeZone?: string, weekly: Array<{weekday:number, intervals:Array<{start:string, end:string}>}>, acknowledgeConfirmedConflicts?: boolean}} payload
 */
export function updateMyAvailability(payload) {
  return client.put("/workers/me/availability", payload).then((res) => res.data.data);
}

/**
 * Worker only: add a date exception (block_day, block_range, or extra).
 * @param {{date:string, type:"block_day"|"block_range"|"extra", start?:string|null, end?:string|null, reason?:string, acknowledgeConfirmedConflicts?:boolean}} payload
 */
export function addAvailabilityException(payload) {
  return client.post("/workers/me/availability/exceptions", payload).then((res) => res.data.data);
}

/** Worker only: remove a date exception by ID. */
export function removeAvailabilityException(exceptionId) {
  return client
    .delete(`/workers/me/availability/exceptions/${exceptionId}`)
    .then((res) => res.data.data);
}

/**
 * Fetch bookable dates and 15-minute start slots for a worker in [from, to].
 * @param {string} workerId
 * @param {{from?:string, to?:string}} [params]
 */
export function getWorkerAvailability(workerId, params = {}) {
  return client
    .get(`/workers/${workerId}/availability`, { params })
    .then((res) => res.data.data);
}

/**
 * Employer only: create a pending appointment request.
 * @param {{workerId:string, jobId?:string|null, startAt:string, durationMinutes:number, purpose:string, idempotencyKey?:string}} payload
 */
export function createAppointment(payload) {
  return client.post("/appointments", payload).then((res) => res.data.data);
}

/**
 * List appointments for the authenticated user.
 * @param {{role?:"worker"|"employer", status?:string, from?:string, to?:string}} [params]
 */
export function getAppointments(params = {}) {
  return client.get("/appointments", { params }).then((res) => res.data.data);
}

export function getAppointmentById(appointmentId) {
  return client.get(`/appointments/${appointmentId}`).then((res) => res.data.data);
}

/** Worker only: accept a pending appointment request. */
export function acceptAppointment(appointmentId) {
  return client.post(`/appointments/${appointmentId}/accept`, {}).then((res) => res.data.data);
}

/** Worker only: reject a pending appointment request. */
export function rejectAppointment(appointmentId, reason = "") {
  return client
    .post(`/appointments/${appointmentId}/reject`, { reason })
    .then((res) => res.data.data);
}

/** Worker or Employer participant: cancel a pending or confirmed appointment. */
export function cancelAppointment(appointmentId, reason = "") {
  return client
    .post(`/appointments/${appointmentId}/cancel`, { reason })
    .then((res) => res.data.data);
}

/** Worker or Employer participant: mark a confirmed appointment as completed. */
export function completeAppointment(appointmentId) {
  return client
    .post(`/appointments/${appointmentId}/complete`, {})
    .then((res) => res.data.data);
}


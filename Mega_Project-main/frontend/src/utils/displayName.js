/**
 * Resolving the name shown for an employer or a worker.
 *
 * Mirrors backend2/src/utils/displayName.js exactly. An employer is no longer
 * required to have a business name - they may hire under their own personal
 * name (User.fullName) - so every place that shows an employer must use this
 * helper rather than reading `businessName` directly, or an employer without
 * one renders as blank.
 *
 * Returns null when there is genuinely no name on record. No name is ever
 * invented; the caller decides what to show instead (see FALLBACK_* below).
 */

const clean = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * Job reads populate `employerId` with the EmployerProfile and, nested inside
 * it, `userId` with just `fullName` - so both halves of the fallback arrive in
 * one response.
 * @param {object|string|null} employerProfile - populated EmployerProfile, or a
 *   bare id string on the endpoints that do not populate it (then null).
 * @returns {string|null}
 */
export function employerName(employerProfile) {
  if (!employerProfile || typeof employerProfile !== "object") return null;
  return clean(employerProfile.businessName) || clean(employerProfile.userId?.fullName) || null;
}

/**
 * @param {object|null} workerProfile
 * @returns {string|null}
 */
export function workerName(workerProfile) {
  if (!workerProfile || typeof workerProfile !== "object") return null;
  return clean(workerProfile.fullName) || clean(workerProfile.userId?.fullName) || null;
}

/**
 * The employer name for the signed-in employer themselves, who has their own
 * profile and User in AuthContext rather than a populated job.
 * @param {object|null} employerProfile
 * @param {object|null} user
 */
export function ownEmployerName(employerProfile, user) {
  return clean(employerProfile?.businessName) || clean(user?.fullName) || null;
}

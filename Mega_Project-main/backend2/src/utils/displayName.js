/**
 * Resolving the name shown for an employer or a worker.
 *
 * An employer is no longer required to supply a business name - they may hire
 * under their own personal name (User.fullName). Every place that displays an
 * employer must go through here so the fallback is identical everywhere, and
 * so a missing name never renders as an empty string or an invented
 * placeholder like "Employer #42".
 *
 * Order for an employer: businessName -> the account's personal name -> null.
 * Returning null (rather than a fabricated name) is deliberate: the caller
 * decides how to present "no name on record", and no layer invents one.
 */

const clean = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * @param {{businessName?: string|null}|null} employerProfile
 * @param {{fullName?: string|null}|null} user - the EmployerProfile's own User,
 *   populated or fetched. Pass null when it is not available; the business
 *   name alone is then used.
 * @returns {string|null}
 */
export const employerDisplayName = (employerProfile, user = null) =>
  clean(employerProfile?.businessName) || clean(user?.fullName) || null;

/**
 * @param {{fullName?: string|null}|null} workerProfile
 * @param {{fullName?: string|null}|null} user
 * @returns {string|null}
 */
export const workerDisplayName = (workerProfile, user = null) =>
  clean(workerProfile?.fullName) || clean(user?.fullName) || null;

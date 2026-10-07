import WorkerProfile from "../models/workerProfile.model.js";
import EmployerProfile from "../models/employerProfile.model.js";

/**
 * Creating the profile that a role requires.
 *
 * A role without its profile is a broken account: every endpoint for that
 * role answers 404 ("profile not found"). Registration used to create the
 * EmployerProfile only when a businessName was supplied, which produced
 * exactly that state - and `POST /auth/add-role` added a role without
 * creating any profile at all, so a worker who became an employer still
 * could not post a job. Both paths now go through here.
 *
 * Idempotent: an existing profile is returned untouched, never overwritten,
 * so calling this for a role the user already has is safe.
 *
 * NO LOCATION IS INVENTED HERE. Registration does not know where the user is,
 * so the new profile simply has no `location` field - see
 * models/geoPoint.schema.js. Both profile models previously REQUIRED a point,
 * which forced this function to seed Pune city-centre coordinates; because those
 * are real, valid coordinates, location matching took them at face value and a
 * worker who had never said where they are was scored as if they lived in
 * central Pune. The user sets their real location from the profile form (or
 * "Use my location"), and until they do, the location match factor reports
 * itself as unavailable rather than wrong.
 */

/**
 * @param {{_id: any, fullName?: string|null}} user
 * @param {string[]} roles - the roles to provision profiles for
 * @param {{fullName?: string, businessName?: string, businessType?: string}} [details]
 * @returns {Promise<{workerProfile: object|null, employerProfile: object|null}>}
 */
export const createProfilesForRoles = async (user, roles = [], details = {}) => {
  const result = { workerProfile: null, employerProfile: null };

  // The worker-facing name falls back to the account's personal name, so a
  // user who registered as an employer and later becomes a worker still gets
  // a named WorkerProfile without being asked for the same name twice.
  const workerName = (details.fullName || user.fullName || "").trim();

  if (roles.includes("worker")) {
    result.workerProfile =
      (await WorkerProfile.findOne({ userId: user._id })) ||
      (await WorkerProfile.create({
        userId: user._id,
        fullName: workerName,
        // No location: absent until the user provides a real one.
      }));
  }

  if (roles.includes("employer")) {
    result.employerProfile =
      (await EmployerProfile.findOne({ userId: user._id })) ||
      (await EmployerProfile.create({
        userId: user._id,
        // Both are optional now. Stored as null rather than "" or an invented
        // value like "Individual", so employerDisplayName() can tell "no
        // business name" apart from a real one and fall back to the person.
        businessName: details.businessName?.trim() || null,
        businessType: details.businessType?.trim() || null,
        // No location: absent until the user provides a real one.
      }));
  }

  return result;
};

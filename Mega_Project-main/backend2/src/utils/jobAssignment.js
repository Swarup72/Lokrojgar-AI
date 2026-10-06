import Job from "../models/job.model.js";

/**
 * Atomically records one more filled worker on a job and recomputes its
 * status from the NEW count, in a single MongoDB document update.
 *
 * Replaces the previous read -> increment in JS -> save() sequence, which
 * lost increments under concurrent acceptances (two requests reading the
 * same old value) and could also leave job.status stale (status computed
 * from one request's local count, then overwritten by another's save).
 *
 * The update pipeline's stages run in order inside one atomic document
 * update, so the second $set sees the incremented value. Semantics are
 * unchanged from the old JS logic:
 *   filledWorkers = (filledWorkers || 0) + 1
 *   status = filledWorkers >= requiredWorkers ? "assigned" : "partially_assigned"
 * requiredWorkers is schema-required with min 1 and default 1, so the
 * comparison never sees a missing/null value on a valid document.
 *
 * Deliberately does NOT cap at requiredWorkers - the existing business
 * logic never did either, and changing that is outside this fix.
 *
 * @param {import("mongoose").Types.ObjectId|string} jobId
 * @returns {Promise<object|null>} the updated job, or null if it doesn't exist
 */
export async function incrementFilledWorkers(jobId) {
  return Job.findByIdAndUpdate(
    jobId,
    [
      { $set: { filledWorkers: { $add: [{ $ifNull: ["$filledWorkers", 0] }, 1] } } },
      {
        $set: {
          status: {
            $cond: [{ $gte: ["$filledWorkers", "$requiredWorkers"] }, "assigned", "partially_assigned"],
          },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true }
  );
}

/**
 * Atomically claims ONE worker slot, but only while the job still has one.
 *
 * incrementFilledWorkers() above is deliberately uncapped, which is safe
 * only when the caller already holds the last word on capacity. The accept
 * path does not: it read filledWorkers into memory, compared it against
 * requiredWorkers in JS, and then incremented. Two acceptances for
 * DIFFERENT applications could both pass that check against the same stale
 * value and both increment, over-hiring the job (measured: two accepted
 * applications and filledWorkers=2 on a requiredWorkers=1 job).
 *
 * The capacity test lives inside the update filter here, so MongoDB
 * evaluates it against the live document under the document lock. Exactly
 * one of two concurrent callers can match; the loser gets null.
 *
 * @param {import("mongoose").Types.ObjectId|string} jobId
 * @returns {Promise<object|null>} the updated job, or null when the job is
 *   missing or already full - the caller must treat null as "no capacity".
 */
export async function reserveWorkerSlot(jobId) {
  return Job.findOneAndUpdate(
    {
      _id: jobId,
      $expr: { $lt: [{ $ifNull: ["$filledWorkers", 0] }, "$requiredWorkers"] },
    },
    [
      { $set: { filledWorkers: { $add: [{ $ifNull: ["$filledWorkers", 0] }, 1] } } },
      {
        $set: {
          status: {
            $cond: [{ $gte: ["$filledWorkers", "$requiredWorkers"] }, "assigned", "partially_assigned"],
          },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true }
  );
}

/**
 * Returns a slot claimed by reserveWorkerSlot() that the caller could not
 * actually use - without this, a reservation whose application transition
 * lost its race would leak capacity the job can never recover.
 *
 * Only ever touches a job that is mid-assignment, so it cannot resurrect a
 * cancelled or completed job, and never drops below zero.
 *
 * @param {import("mongoose").Types.ObjectId|string} jobId
 * @returns {Promise<object|null>}
 */
export async function releaseWorkerSlot(jobId) {
  return Job.findOneAndUpdate(
    {
      _id: jobId,
      status: { $in: ["assigned", "partially_assigned"] },
      $expr: { $gt: [{ $ifNull: ["$filledWorkers", 0] }, 0] },
    },
    [
      { $set: { filledWorkers: { $max: [0, { $subtract: [{ $ifNull: ["$filledWorkers", 0] }, 1] }] } } },
      {
        $set: {
          status: {
            $switch: {
              branches: [
                { case: { $gte: ["$filledWorkers", "$requiredWorkers"] }, then: "assigned" },
                { case: { $gt: ["$filledWorkers", 0] }, then: "partially_assigned" },
              ],
              default: "open",
            },
          },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true }
  );
}

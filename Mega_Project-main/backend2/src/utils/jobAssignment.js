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

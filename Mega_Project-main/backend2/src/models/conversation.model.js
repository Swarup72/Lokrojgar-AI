import mongoose from "mongoose";

/**
 * A chat between ONE worker and ONE employer about ONE job.
 *
 * This schema was reshaped (the collection held 0 documents, so nothing was
 * migrated). Previously it declared only `participantIds` while the controller
 * wrote `workerId`/`employerId` - fields that did not exist - so every
 * conversation was stored with an EMPTY participant list, "my conversations"
 * always returned nothing, and nothing identified who was allowed in.
 *
 * The old unique index {jobId, participantIds} was also wrong: participantIds
 * is an array, so a compound unique index over it generated one key per
 * participant and the key (job, employer) collided as soon as the employer
 * opened a second conversation on the same job. An employer hiring two workers
 * for one job could not chat with both.
 *
 * The relationship is now explicit, and uniqueness is per (job, worker) - which
 * is exactly the granularity of the Application that authorizes the chat.
 */
const conversationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
      required: true,
      index: true,
    },

    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployerProfile",
      required: true,
      index: true,
    },

    // The two User ids, denormalized so "every conversation I am in" is a
    // single indexed query and so authorization never has to resolve profiles
    // again. Derived server-side from the job and the application - never from
    // anything a client sends.
    participantIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      required: true,
      validate: {
        validator: (ids) => Array.isArray(ids) && ids.length === 2,
        message: "A job conversation has exactly two participants",
      },
      index: true,
    },

    lastMessage: {
      type: String,
      default: null,
    },

    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One conversation per worker per job. Both fields are scalars, so this is a
// plain compound unique index with no multikey surprises - and it is the real
// guarantee behind getOrCreateConversation, which cannot rely on a findOne
// check alone when two requests arrive together.
conversationSchema.index({ jobId: 1, workerId: 1 }, { unique: true });

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;

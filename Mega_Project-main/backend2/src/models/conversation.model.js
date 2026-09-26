import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participantIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
    ],

    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: false,
      default: null,
      index: true,
    },

    conversationType: {
      type: String,
      enum: ["job", "direct"],
      required: true,
      default: "direct",
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

// Prevent duplicate conversations for the same job and participants
conversationSchema.index(
  { jobId: 1, participantIds: 1 },
  {
    unique: true,
    partialFilterExpression: {
      jobId: { $type: "objectId" },
    },
  }
);

const Conversation = mongoose.model(
  "Conversation",
  conversationSchema
);

export default Conversation;
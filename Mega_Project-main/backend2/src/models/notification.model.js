import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "job_alert",
        "application_update",
        "payment_update",
        "system",
        "dispute",
        "chat",
      ],
      required: true,
    },

    title: {
      mr: { type: String, trim: true, default: null },
      hi: { type: String, trim: true, default: null },
      en: { type: String, trim: true, default: null },
    },

    body: {
      mr: { type: String, trim: true, default: null },
      hi: { type: String, trim: true, default: null },
      en: { type: String, trim: true, default: null },
    },

    refId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    data: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

// Index for fetching user's read/unread notifications
notificationSchema.index({
  userId: 1,
  isRead: 1,
  createdAt: -1,
});

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
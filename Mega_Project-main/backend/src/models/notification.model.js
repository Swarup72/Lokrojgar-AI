import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      required: true,
      trim: true,
    },

    title: {
      mr: {
        type: String,
        required: true,
        trim: true,
      },
      hi: {
        type: String,
        required: true,
        trim: true,
      },
      en: {
        type: String,
        required: true,
        trim: true,
      },
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    readAt: {
      type: Date,
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
  createdAt: 1,
});

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
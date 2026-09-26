import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    messageType: {
      type: String,
      enum: ["text", "voice", "image", "system"],
      required: true,
      default: "text",
    },

    text: {
      type: String,
      trim: true,
    },

    audioUrl: {
      type: String,
      trim: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for fetching messages in conversation order
messageSchema.index({
  conversationId: 1,
  createdAt: 1,
});

const Message = mongoose.model("Message", messageSchema);

export default Message;
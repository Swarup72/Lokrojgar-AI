import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
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
      default: null,
      // Bounded at the schema level as well as in the validator: a message is
      // a chat line, not a document, and nothing should be able to store an
      // unbounded string here. `trim` means a whitespace-only message arrives
      // as "" and is rejected by the controller as empty.
      maxlength: 2000,
    },

    audioUrl: {
      type: String,
      trim: true,
      default: null,
    },

    imageUrl: {
      type: String,
      trim: true,
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
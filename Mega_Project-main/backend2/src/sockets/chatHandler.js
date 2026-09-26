import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";

/**
 * Socket.IO Chat Handlers
 * @param {import("socket.io").Server} io - Socket.io Server instance
 * @param {import("socket.io").Socket} socket - Individual Client Socket connection
 */
export const registerChatHandlers = (io, socket) => {
  // Join a conversation room
  socket.on("join_conversation", ({ conversationId }) => {
    if (conversationId) {
      socket.join(`conversation_${conversationId}`);
      console.log(`Socket ${socket.id} joined conversation_${conversationId}`);
    }
  });

  // Leave conversation room
  socket.on("leave_conversation", ({ conversationId }) => {
    if (conversationId) {
      socket.leave(`conversation_${conversationId}`);
    }
  });

  // Send real-time chat message
  socket.on("send_message", async (data) => {
    try {
      const { conversationId, senderId, text, messageType = "text", audioUrl, imageUrl } = data;

      const message = await Message.create({
        conversationId,
        senderId,
        messageType,
        text,
        audioUrl,
        imageUrl,
      });

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: text || (messageType === "voice" ? "Voice Message" : "Image"),
        lastMessageAt: new Date(),
      });

      // Broadcast message to conversation room
      io.to(`conversation_${conversationId}`).emit("new_message", message);
    } catch (error) {
      socket.emit("chat_error", { message: error.message });
    }
  });

  // Typing indicator
  socket.on("typing_start", ({ conversationId, userId }) => {
    socket.to(`conversation_${conversationId}`).emit("user_typing", { userId, isTyping: true });
  });

  socket.on("typing_stop", ({ conversationId, userId }) => {
    socket.to(`conversation_${conversationId}`).emit("user_typing", { userId, isTyping: false });
  });
};

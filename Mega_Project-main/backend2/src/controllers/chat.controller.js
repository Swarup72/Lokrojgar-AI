import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadAudioService, uploadImageService } from "../services/storage.service.js";

export const getOrCreateConversation = asyncHandler(async (req, res) => {
  const { jobId, workerId, employerId } = req.body;

  let conversation = await Conversation.findOne({ jobId, workerId, employerId });

  if (!conversation) {
    conversation = await Conversation.create({
      jobId,
      workerId,
      employerId,
    });
  }

  return res.status(200).json(new ApiResponse(200, conversation, "Conversation retrieved/created"));
});

export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({
    $or: [{ workerId: req.user._id }, { employerId: req.user._id }],
  })
    .populate("jobId workerId employerId")
    .sort({ lastMessageAt: -1 });

  return res.status(200).json(new ApiResponse(200, conversations, "User conversations retrieved"));
});

export const sendMessage = asyncHandler(async (req, res) => {
  const { conversationId, text, messageType = "text", audioUrl, imageUrl } = req.body;

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new ApiError(404, "Conversation not found");

  const message = await Message.create({
    conversationId,
    senderId: req.user._id,
    messageType,
    text,
    audioUrl,
    imageUrl,
  });

  conversation.lastMessage = text || (messageType === "voice" ? "Voice Message" : "Image");
  conversation.lastMessageAt = new Date();
  await conversation.save();

  return res.status(201).json(new ApiResponse(201, message, "Message sent"));
});

export const listMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const messages = await Message.find({ conversationId })
    .populate("senderId", "phone avatar")
    .sort({ createdAt: 1 });

  return res.status(200).json(new ApiResponse(200, messages, "Messages retrieved"));
});

export const markMessagesRead = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await Message.updateMany(
    { conversationId, senderId: { $ne: req.user._id }, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  return res.status(200).json(new ApiResponse(200, {}, "Messages marked as read"));
});

export const uploadVoiceMessage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "Audio file is required");

  const upload = await uploadAudioService(req.file.path);
  if (!upload) throw new ApiError(500, "Failed to upload audio file");

  return res.status(200).json(new ApiResponse(200, { audioUrl: upload.secure_url }, "Voice message uploaded"));
});

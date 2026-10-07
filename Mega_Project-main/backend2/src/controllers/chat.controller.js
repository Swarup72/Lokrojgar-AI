import mongoose from "mongoose";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import Job from "../models/job.model.js";
import Application from "../models/application.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { employerDisplayName, workerDisplayName } from "../utils/displayName.js";

/**
 * Worker <-> employer chat, scoped to one job and gated on the hiring
 * relationship.
 *
 * This controller was rewritten. The previous version took `jobId`, `workerId`
 * and `employerId` straight from the request body with no relationship check at
 * all, and never verified participation on read or write. Measured on an
 * isolated database: an unrelated third user could READ another pair's
 * conversation (HTTP 200) and POST a message into it (HTTP 201) just by using
 * its id, and whitespace-only messages were accepted.
 *
 * Every endpoint here now resolves the caller's own profile from the JWT and
 * requires an ACCEPTED (or completed) Application linking that profile to the
 * conversation's job. Nothing that decides access is read from the request.
 *
 * Transport is plain HTTP: the frontend polls while a conversation is open.
 * socket.io is a dependency of this project but is not wired to the server, and
 * adding a second authenticated surface would mean duplicating all of the
 * authorization below for the socket handshake and every room join.
 */

// Chat opens when the relationship is real, and stays open after the work is
// finished - a worker and employer still need to settle up and arrange a
// rating. "invited"/"applied"/"shortlisted" are NOT enough: chat must not be a
// channel for contacting workers who have not agreed to anything.
const CHAT_ELIGIBLE_APPLICATION_STATUSES = ["accepted", "completed"];

const MAX_MESSAGE_LENGTH = 2000;
const MESSAGE_PAGE_LIMIT = 200;

const isObjectId = (value) => mongoose.isValidObjectId(value);

/**
 * Resolves the caller's side of a conversation about `job`, and the accepted
 * application that authorizes it.
 *
 * Returns null when the caller has no hiring relationship with this job, which
 * callers surface as 403/404 - never as a partial answer.
 */
async function resolveRelationship(job, userId, { workerId = null } = {}) {
  const [workerProfile, employerProfile] = await Promise.all([
    WorkerProfile.findOne({ userId }),
    EmployerProfile.findOne({ userId }),
  ]);

  // Employer side: must own the job, and the named worker must be hired on it.
  if (employerProfile && String(job.employerId) === String(employerProfile._id)) {
    const application = await Application.findOne({
      jobId: job._id,
      ...(workerId ? { workerId } : {}),
      status: { $in: CHAT_ELIGIBLE_APPLICATION_STATUSES },
    });
    if (!application) return null;
    return { role: "employer", employerProfile, workerId: application.workerId, application };
  }

  // Worker side: must themselves be hired on this job.
  if (workerProfile) {
    const application = await Application.findOne({
      jobId: job._id,
      workerId: workerProfile._id,
      status: { $in: CHAT_ELIGIBLE_APPLICATION_STATUSES },
    });
    if (!application) return null;
    return { role: "worker", workerProfile, workerId: workerProfile._id, application };
  }

  return null;
}

/**
 * Loads a conversation the caller is actually a participant in.
 *
 * Participation is checked against the stored participantIds - the two User ids
 * the server itself wrote - and the hiring relationship is re-checked, so a
 * conversation does not stay open if the application it rests on is undone.
 * A non-participant gets 404, not 403: the existence of someone else's
 * conversation is not information they are entitled to.
 */
async function loadParticipantConversation(conversationId, userId) {
  if (!isObjectId(conversationId)) throw new ApiError(400, "Invalid conversation ID format");

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new ApiError(404, "Conversation not found");

  const isParticipant = conversation.participantIds.some((id) => String(id) === String(userId));
  if (!isParticipant) throw new ApiError(404, "Conversation not found");

  const application = await Application.findOne({
    jobId: conversation.jobId,
    workerId: conversation.workerId,
    status: { $in: CHAT_ELIGIBLE_APPLICATION_STATUSES },
  });
  if (!application) {
    throw new ApiError(403, "This conversation is no longer active for this job");
  }

  return conversation;
}

/**
 * POST /chat/conversations  { jobId, workerId? }
 *
 * Opens (or reopens) the conversation for a hiring relationship. The employer
 * supplies which hired worker they mean; a worker supplies only the job,
 * because they can only ever be their own side of it.
 */
export const getOrCreateConversation = asyncHandler(async (req, res) => {
  const { jobId, workerId } = req.body;

  if (!isObjectId(jobId)) throw new ApiError(400, "Invalid job ID format");
  if (workerId && !isObjectId(workerId)) throw new ApiError(400, "Invalid worker ID format");

  const job = await Job.findById(jobId);
  if (!job) throw new ApiError(404, "Job not found");

  const relationship = await resolveRelationship(job, req.user._id, { workerId });
  if (!relationship) {
    throw new ApiError(
      403,
      "Chat opens once a job request or application has been accepted for this job"
    );
  }

  const [workerProfile, employerProfile] = await Promise.all([
    WorkerProfile.findById(relationship.workerId),
    EmployerProfile.findById(job.employerId),
  ]);
  if (!workerProfile || !employerProfile) throw new ApiError(404, "Participant profile not found");

  const existing = await Conversation.findOne({ jobId: job._id, workerId: workerProfile._id });
  if (existing) {
    return res.status(200).json(new ApiResponse(200, existing, "Conversation retrieved"));
  }

  try {
    const conversation = await Conversation.create({
      jobId: job._id,
      workerId: workerProfile._id,
      employerId: employerProfile._id,
      // Server-derived, from the profiles - never from the request body.
      participantIds: [workerProfile.userId, employerProfile.userId],
    });
    return res.status(201).json(new ApiResponse(201, conversation, "Conversation created"));
  } catch (error) {
    // The findOne above is an optimization only: two requests can both pass it.
    // The unique {jobId, workerId} index is the guarantee, and losing that race
    // means the conversation now exists - which is what the caller wanted.
    if (error.code === 11000) {
      const conversation = await Conversation.findOne({ jobId: job._id, workerId: workerProfile._id });
      if (conversation) {
        return res.status(200).json(new ApiResponse(200, conversation, "Conversation retrieved"));
      }
    }
    throw error;
  }
});

/** GET /chat/conversations - every conversation the caller participates in. */
export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ participantIds: req.user._id })
    .populate({
      path: "jobId",
      select: "title titleText status payAmount payType city originalLanguage",
    })
    .populate({ path: "workerId", select: "fullName profilePhoto", populate: { path: "userId", select: "fullName" } })
    .populate({
      path: "employerId",
      select: "businessName profilePhoto",
      populate: { path: "userId", select: "fullName" },
    })
    .sort({ lastMessageAt: -1, createdAt: -1 });

  // One extra aggregate query for every conversation's unread count, rather
  // than one query per conversation (which would be N+1).
  const unreadByConversation = new Map(
    (
      await Message.aggregate([
        {
          $match: {
            conversationId: { $in: conversations.map((c) => c._id) },
            senderId: { $ne: new mongoose.Types.ObjectId(String(req.user._id)) },
            isRead: false,
          },
        },
        { $group: { _id: "$conversationId", count: { $sum: 1 } } },
      ])
    ).map((row) => [String(row._id), row.count])
  );

  const payload = conversations.map((conversation) => ({
    ...conversation.toObject(),
    // The name of the OTHER party, resolved with the same business-name ->
    // personal-name fallback used everywhere else.
    counterpartName:
      String(conversation.workerId?.userId?._id || conversation.workerId?.userId) === String(req.user._id)
        ? employerDisplayName(conversation.employerId, conversation.employerId?.userId)
        : workerDisplayName(conversation.workerId, conversation.workerId?.userId),
    unreadCount: unreadByConversation.get(String(conversation._id)) || 0,
  }));

  return res.status(200).json(new ApiResponse(200, payload, "Conversations retrieved"));
});

/**
 * POST /chat/conversations/:conversationId/messages  { text }
 *
 * senderId comes from the JWT. A client cannot write a message as someone else,
 * and cannot write into a conversation it is not part of.
 */
export const sendMessage = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { text } = req.body;

  const conversation = await loadParticipantConversation(conversationId, req.user._id);

  // Trimmed before measuring, so "   " is empty rather than 3 characters.
  const body = typeof text === "string" ? text.trim() : "";
  if (!body) throw new ApiError(400, "Message cannot be empty");
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new ApiError(400, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`);
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderId: req.user._id,
    messageType: "text",
    text: body,
  });

  // The preview is for a list row, not storage of the message itself.
  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { lastMessage: body.slice(0, 120), lastMessageAt: message.createdAt } }
  );

  return res.status(201).json(new ApiResponse(201, message, "Message sent"));
});

/**
 * GET /chat/conversations/:conversationId/messages?after=<ISO date>
 *
 * `after` is what makes polling cheap: the client asks only for what it has
 * not seen. Capped page size so a long conversation cannot be pulled in one
 * unbounded response.
 */
export const listMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { after } = req.query;

  const conversation = await loadParticipantConversation(conversationId, req.user._id);

  const filter = { conversationId: conversation._id };
  if (after) {
    const since = new Date(after);
    if (Number.isNaN(since.getTime())) throw new ApiError(400, "Invalid 'after' timestamp");
    filter.createdAt = { $gt: since };
  }

  const messages = await Message.find(filter)
    .sort({ createdAt: 1 })
    .limit(MESSAGE_PAGE_LIMIT);

  return res.status(200).json(new ApiResponse(200, messages, "Messages retrieved"));
});

/** PATCH /chat/conversations/:conversationId/read */
export const markMessagesRead = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const conversation = await loadParticipantConversation(conversationId, req.user._id);

  const result = await Message.updateMany(
    { conversationId: conversation._id, senderId: { $ne: req.user._id }, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, { markedRead: result.modifiedCount || 0 }, "Messages marked as read"));
});

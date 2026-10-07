import { Router } from "express";
import {
  getOrCreateConversation,
  listConversations,
  sendMessage,
  listMessages,
  markMessagesRead,
} from "../controllers/chat.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createConversationValidator,
  conversationIdValidator,
  sendMessageValidator,
  listMessagesValidator,
} from "../validators/chat.validator.js";

const router = Router();

// Every chat route is authenticated. There is deliberately NO authorizeRoles
// here: a dual-role account can legitimately be the worker in one conversation
// and the employer in another, so the per-conversation relationship check in
// the controller is the authority - a role check would be both too coarse and
// easy to mistake for sufficient.
router.use(verifyJWT);

router.post("/conversations", validate(createConversationValidator), getOrCreateConversation);
router.get("/conversations", listConversations);
router.get(
  "/conversations/:conversationId/messages",
  validate(listMessagesValidator),
  listMessages
);
router.post(
  "/conversations/:conversationId/messages",
  validate(sendMessageValidator),
  sendMessage
);
router.patch("/conversations/:conversationId/read", validate(conversationIdValidator), markMessagesRead);

export default router;

// NOTE: POST /chat/voice-message is gone. It uploaded any authenticated user's
// audio to Cloudinary with no relationship check at all, so it was an open
// upload endpoint attached to the chat feature. Text chat is the baseline this
// change commits to; attachments can return behind the same relationship gate
// (and with their own size/type limits) as a separate, tested change.

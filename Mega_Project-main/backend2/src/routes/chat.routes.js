import { Router } from "express";
import {
  getOrCreateConversation,
  listConversations,
  sendMessage,
  listMessages,
  markMessagesRead,
  uploadVoiceMessage,
} from "../controllers/chat.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { uploadAudio } from "../middlewares/multer.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post("/conversations", getOrCreateConversation);
router.get("/conversations", listConversations);
router.post("/messages", sendMessage);
router.get("/conversations/:conversationId/messages", listMessages);
router.patch("/conversations/:conversationId/read", markMessagesRead);
router.post("/voice-message", uploadAudio.single("audio"), uploadVoiceMessage);

export default router;

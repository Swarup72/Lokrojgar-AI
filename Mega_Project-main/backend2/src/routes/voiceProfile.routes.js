import { Router } from "express";
import {
  uploadAudioAndExtract,
  confirmAndApplyToProfile,
  startGuidedSession,
  getGuidedDraft,
  submitGuidedVoiceStep,
  setGuidedDraftField,
  discardGuidedDraft,
} from "../controllers/voiceProfile.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { uploadAudio } from "../middlewares/multer.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  guidedStartValidator,
  guidedDraftQueryValidator,
  guidedSetFieldValidator,
  confirmVoiceProfileValidator,
} from "../validators/voiceProfile.validator.js";

const router = Router();

router.use(verifyJWT);
router.use(authorizeRoles("worker", "employer", "admin"));

// --- Quick flow: one recording, one extraction. UNCHANGED. -------------------
router.post("/extract", uploadAudio.single("audio"), uploadAudioAndExtract);

// --- Guided flow: one question at a time, into a server-side draft -----------
//
// Literal paths only, so there is no wildcard for them to collide with. Every
// handler resolves the worker from req.user and scopes the draft by workerId -
// ownership is never taken from the body.
router.post("/guided/start", validate(guidedStartValidator), startGuidedSession);
router.get("/guided/draft", validate(guidedDraftQueryValidator), getGuidedDraft);
// Multipart: the only guided route that carries audio. The recording is
// transcribed and deleted, exactly as in the quick flow - nothing is stored.
router.post("/guided/step", uploadAudio.single("audio"), submitGuidedVoiceStep);
// No audio: the tap-only steps (languages, availability) and review-screen edits.
router.patch("/guided/step", validate(guidedSetFieldValidator), setGuidedDraftField);
router.delete("/guided/draft", discardGuidedDraft);

// --- Shared commit path, used by BOTH flows ----------------------------------
// There is deliberately only one of these: quick and guided converge on the same
// additive merge into WorkerProfile and the same WorkerSkill upserts.
router.post("/confirm", validate(confirmVoiceProfileValidator), confirmAndApplyToProfile);

export default router;

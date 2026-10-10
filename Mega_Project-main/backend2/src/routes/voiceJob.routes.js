import { Router } from "express";
import {
  startVoiceJobSession,
  getVoiceJobDraft,
  submitVoiceJobStep,
  setVoiceJobDraftField,
  consumeVoiceJobDraft,
  discardVoiceJobDraft,
} from "../controllers/voiceJob.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { uploadAudio } from "../middlewares/multer.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  voiceJobStartValidator,
  voiceJobDraftQueryValidator,
  voiceJobSetFieldValidator,
  voiceJobConsumeValidator,
} from "../validators/voiceJob.validator.js";

const router = Router();

// Employers only. A worker has no reason to draft a job advert, and the
// controller additionally requires an EmployerProfile to exist.
router.use(verifyJWT);
router.use(authorizeRoles("employer", "admin"));

// Literal paths only — no wildcards for these to collide with. Every handler
// resolves the employer from req.user and scopes the draft by employerId;
// ownership is never taken from the body.
router.post("/guided/start", validate(voiceJobStartValidator), startVoiceJobSession);
router.get("/guided/draft", validate(voiceJobDraftQueryValidator), getVoiceJobDraft);

// Multipart: the only route here that carries audio. The recording is
// transcribed and deleted in the same request — nothing is stored.
router.post("/guided/step", uploadAudio.single("audio"), submitVoiceJobStep);

// No audio: tap-only steps and review-screen corrections.
router.patch("/guided/step", validate(voiceJobSetFieldValidator), setVoiceJobDraftField);

router.post("/guided/consume", validate(voiceJobConsumeValidator), consumeVoiceJobDraft);
router.delete("/guided/draft", discardVoiceJobDraft);

// NOTE: there is deliberately NO publish route here.
//
// The reviewed values are poured into the existing Add Job form and published
// by POST /jobs, which validates and auto-translates exactly as it does for a
// typed advert. Adding a publish path here would be a second way to create a
// Job with different validation — the same class of mistake that retired the
// /offers hiring path (see routes/index.js).
export default router;

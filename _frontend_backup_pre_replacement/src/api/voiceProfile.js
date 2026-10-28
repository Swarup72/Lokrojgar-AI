import client, { AI_REQUEST_TIMEOUT_MS } from "./client";

/**
 * Worker only. Multipart upload - field name `audio` is exact, mirrors
 * multer's `uploadAudio.single("audio")` on the backend.
 * @param {Blob|File} audioFile
 * @param {"mr"|"hi"|"en"} language
 */
export function extract(audioFile, language) {
  const formData = new FormData();
  formData.append("audio", audioFile);
  formData.append("language", language);
  return client
    .post("/voice-profile/extract", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: AI_REQUEST_TIMEOUT_MS, // transcription + local LLM extraction
    })
    .then((res) => res.data.data);
}

/**
 * Confirm and commit the voice profile (worker or employer).
 * @param {string} voiceProfileId
 * @param {object} confirmedFields
 * @param {"worker"|"employer"} [role="worker"]
 */
export function confirm(voiceProfileId, confirmedFields, role) {
  const payload = { voiceProfileId, confirmedFields };
  if (role && role !== "worker") payload.role = role;
  // Long timeout: skill and category resolution may each call the local LLM.
  return client
    .post("/voice-profile/confirm", payload, { timeout: AI_REQUEST_TIMEOUT_MS })
    .then((res) => res.data.data);
}

// --- Guided voice profile ----------------------------------------------------
//
// The field-by-field flow. It shares the transcription path, the frozen Whisper
// configuration and the number-grounding guard with extract() above, and it ends
// on the SAME confirm() call - there is only one path into the canonical profile.
//
// Answers accumulate in a server-side draft, so closing the browser mid-wizard
// loses nothing and an unfinished session can never touch the real profile.

/**
 * Starts OR resumes the guided session for a spoken language and role.
 * @param {"mr"|"hi"|"en"} language - the language the user will SPEAK
 * @param {"worker"|"employer"} [role="worker"]
 * @returns {Promise<{voiceProfileId:string, language:string, status:string, role:string, steps:string[], voiceSteps:string[], tapSteps:string[], draftFields:object, completedSteps:string[]}>}
 */
export function startGuided(language, role) {
  const payload = { language };
  if (role && role !== "worker") payload.role = role;
  return client.post("/voice-profile/guided/start", payload).then((res) => res.data.data);
}

/** The draft in progress for this language and role, or null. Used to offer a resume. */
export function getGuidedDraft(language, role) {
  const params = { language };
  if (role && role !== "worker") params.role = role;
  return client
    .get("/voice-profile/guided/draft", { params })
    .then((res) => res.data.data);
}

/**
 * One voice step. A result with `ok: false` is normal - it means "say that
 * again" - and carries the transcript so the user can see what was heard.
 * @param {Blob|File} audioFile
 * @param {"mr"|"hi"|"en"} language
 * @param {string} field
 * @param {"worker"|"employer"} [role="worker"]
 * @returns {Promise<{field:string, transcript:string, value:any, ok:boolean, reason:string, candidates:number[], usedLlm:boolean, draftFields:object, completedSteps:string[]}>}
 */
export function submitGuidedStep(audioFile, language, field, role) {
  const formData = new FormData();
  formData.append("audio", audioFile);
  formData.append("language", language);
  formData.append("field", field);
  if (role && role !== "worker") formData.append("role", role);
  return client
    .post("/voice-profile/guided/step", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      // Transcription on a local model takes seconds, not milliseconds.
      timeout: AI_REQUEST_TIMEOUT_MS,
    })
    .then((res) => res.data.data);
}

/**
 * Saves a step WITHOUT audio: tap-only steps and any manual correction on the review screen. No AI call.
 */
export function setGuidedField(language, field, value, role) {
  const payload = { language, field, value };
  if (role && role !== "worker") payload.role = role;
  return client
    .patch("/voice-profile/guided/step", payload)
    .then((res) => res.data.data);
}

/** Abandons the draft deliberately. The canonical profile is untouched. */
export function discardGuidedDraft(language, role) {
  const data = { language };
  if (role && role !== "worker") data.role = role;
  return client
    .delete("/voice-profile/guided/draft", { data })
    .then((res) => res.data.data);
}

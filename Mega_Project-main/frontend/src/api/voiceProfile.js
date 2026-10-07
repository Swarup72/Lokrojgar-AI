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
 * Worker only. `confirmedFields.skills`/`.preferredJobCategories` (free
 * text from voice extraction) are resolved server-side against the real
 * Skill/JobCategory catalog - not every value is guaranteed to resolve.
 * @param {string} voiceProfileId
 * @param {{fullName?:string, city?:string, expectedPay?:number, experienceYears?:number, availability?:string, languages?:string[], bio?:string, skills?:string[], preferredJobCategories?:string[]}} confirmedFields
 * @returns {Promise<{workerProfile: object, voiceSkillResolution: {skills: {resolved: {rawText:string, id:string, canonicalName:string}[], unresolved: string[]}, preferredJobCategories: {resolved: {rawText:string, id:string, canonicalName:string}[], unresolved: string[]}}}>}
 */
export function confirm(voiceProfileId, confirmedFields) {
  // Long timeout: skill and category resolution may each call the local LLM.
  return client
    .post("/voice-profile/confirm", { voiceProfileId, confirmedFields }, { timeout: AI_REQUEST_TIMEOUT_MS })
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
 * Starts OR resumes the guided session for a spoken language.
 * @param {"mr"|"hi"|"en"} language - the language the worker will SPEAK
 * @returns {Promise<{voiceProfileId:string, language:string, status:string, steps:string[], voiceSteps:string[], tapSteps:string[], draftFields:object, completedSteps:string[]}>}
 */
export function startGuided(language) {
  return client.post("/voice-profile/guided/start", { language }).then((res) => res.data.data);
}

/** The draft in progress for this language, or null. Used to offer a resume. */
export function getGuidedDraft(language) {
  return client
    .get("/voice-profile/guided/draft", { params: { language } })
    .then((res) => res.data.data);
}

/**
 * One voice step. A result with `ok: false` is normal - it means "say that
 * again" - and carries the transcript so the worker can see what was heard.
 * @param {Blob|File} audioFile
 * @param {"mr"|"hi"|"en"} language
 * @param {"fullName"|"expectedPay"|"experienceYears"|"skills"|"city"} field
 * @returns {Promise<{field:string, transcript:string, value:any, ok:boolean, reason:string, candidates:number[], usedLlm:boolean, draftFields:object, completedSteps:string[]}>}
 */
export function submitGuidedStep(audioFile, language, field) {
  const formData = new FormData();
  formData.append("audio", audioFile);
  formData.append("language", language);
  formData.append("field", field);
  return client
    .post("/voice-profile/guided/step", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      // Transcription on a local model takes seconds, not milliseconds.
      timeout: AI_REQUEST_TIMEOUT_MS,
    })
    .then((res) => res.data.data);
}

/**
 * Saves a step WITHOUT audio: the tap-only steps (languages, availability) and
 * any manual correction on the review screen. No AI call.
 */
export function setGuidedField(language, field, value) {
  return client
    .patch("/voice-profile/guided/step", { language, field, value })
    .then((res) => res.data.data);
}

/** Abandons the draft deliberately. The canonical profile is untouched. */
export function discardGuidedDraft(language) {
  return client
    .delete("/voice-profile/guided/draft", { data: { language } })
    .then((res) => res.data.data);
}

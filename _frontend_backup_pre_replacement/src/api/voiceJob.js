import client, { AI_REQUEST_TIMEOUT_MS } from "./client";

/**
 * Guided voice JOB POSTING — employer only.
 *
 * This client has no publish call, deliberately. The wizard produces a draft;
 * the reviewed values are poured into the existing Add Job form and published
 * by jobs.create() — the same validated, auto-translating endpoint a typed
 * advert goes through. Nothing here can put a job live.
 *
 * Answers accumulate in a server-side draft, so closing the browser mid-wizard
 * loses nothing and an unfinished advert can never appear to workers.
 */

/**
 * Starts OR resumes this employer's draft for a spoken language.
 * @param {"mr"|"hi"|"en"} language - the language the employer will SPEAK
 * @returns {Promise<{voiceJobDraftId:string, language:string, status:string, steps:string[], voiceSteps:string[], tapSteps:string[], draftFields:object, completedSteps:string[]}>}
 */
export function startGuided(language) {
  return client.post("/voice-job/guided/start", { language }).then((res) => res.data.data);
}

/** The open draft for this language, or null. Used to offer a resume. */
export function getGuidedDraft(language) {
  return client
    .get("/voice-job/guided/draft", { params: { language } })
    .then((res) => res.data.data);
}

/**
 * One voice step. `ok: false` is normal — it means "say that again" — and the
 * response carries the transcript so the employer can see what was heard.
 * @param {Blob|File} audioFile
 * @param {"mr"|"hi"|"en"} language
 * @param {string} field
 */
export function submitGuidedStep(audioFile, language, field) {
  const formData = new FormData();
  formData.append("audio", audioFile);
  formData.append("language", language);
  formData.append("field", field);
  return client
    .post("/voice-job/guided/step", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      // Transcription on a local model takes seconds, not milliseconds; the
      // skills step additionally resolves phrases against the catalog.
      timeout: AI_REQUEST_TIMEOUT_MS,
    })
    .then((res) => res.data.data);
}

/** Saves a step WITHOUT audio: tap-only steps and review-screen corrections. No AI call. */
export function setGuidedField(language, field, value) {
  return client
    .patch("/voice-job/guided/step", { language, field, value })
    .then((res) => res.data.data);
}

/**
 * Marks the draft as handed to the Add Job form. NOT a publish — no job is
 * created. It stops the next session resuming an advert already moved past.
 */
export function consumeGuidedDraft(language) {
  return client
    .post("/voice-job/guided/consume", { language })
    .then((res) => res.data.data);
}

/** Abandons the draft deliberately. No job is affected. */
export function discardGuidedDraft(language) {
  return client
    .delete("/voice-job/guided/draft", { data: { language } })
    .then((res) => res.data.data);
}

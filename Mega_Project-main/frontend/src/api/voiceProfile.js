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

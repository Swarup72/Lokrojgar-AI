import client from "./client";

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
    .post("/voice-profile/extract", formData, { headers: { "Content-Type": "multipart/form-data" } })
    .then((res) => res.data.data);
}

/**
 * Worker only. `confirmedFields.skills`/`.preferredJobCategories` are
 * silently ignored server-side by design (free text, not catalog
 * ObjectIds) - never include them here even if the review UI collected them.
 * @param {string} voiceProfileId
 * @param {{fullName?:string, city?:string, expectedPay?:number, experienceYears?:number, availability?:string, languages?:string[], bio?:string}} confirmedFields
 */
export function confirm(voiceProfileId, confirmedFields) {
  return client.post("/voice-profile/confirm", { voiceProfileId, confirmedFields }).then((res) => res.data.data);
}

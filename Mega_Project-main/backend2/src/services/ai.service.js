import fs from "fs";
import path from "path";
import { forwardAudioForExtraction, forwardAudioForFieldExtraction } from "./aiService.client.js";
import logger from "../utils/logger.js";

/**
 * Thrown when the AI service can't process the request at all - either it
 * explicitly said so (503), or it couldn't be reached (network error, which
 * carries no statusCode). Distinct from a real provider failure so the
 * controller can return a clean 503 without pretending a request was even
 * attempted.
 */
export class AiServiceUnavailableError extends Error {}

// Mirrors backend2's own ALLOWED_AUDIO_TYPES (multer.middleware.js) - the
// file on disk was already validated against that list, so this only needs
// to map its extension back to a Content-Type for the outgoing multipart
// request. Falls back to a generic type for anything unexpected rather than
// rejecting - FastAPI/Sarvam decide whether the actual bytes are usable.
const EXTENSION_CONTENT_TYPES = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "audio/mp4",
  ".m4a": "audio/m4a",
  ".webm": "audio/webm",
};

const resolveContentType = (filePath) =>
  EXTENSION_CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";

// A network-level failure (AI service unreachable) surfaces as a fetch()
// rejection with no .statusCode at all - distinct from FastAPI explicitly
// responding 503, but both mean the same thing to this caller: voice
// processing isn't available right now.
const isServiceUnavailable = (error) => error.statusCode === undefined || error.statusCode === 503;

/**
 * Transcribe Marathi/Hindi/English audio and extract structured worker
 * profile fields, via the centralized Python AI service.
 *
 * Interface preserved exactly for existing callers:
 * processVoiceProfileAudio(audioFilePath, language) -> { transcript, extractedProfile, confidence }.
 *
 * @param {string} audioFilePath - local path to the audio file (must still
 *   exist on disk - caller is responsible for not deleting it beforehand).
 * @param {string} language - "mr" | "hi" | "en" | "auto", defaults to "mr".
 * @returns {Promise<{transcript: string, extractedProfile: object, confidence: number|null}>}
 */
export const processVoiceProfileAudio = async (audioFilePath, language = "mr") => {
  logger.info("Voice processing started", { language });

  // Read synchronously, in full, before anything else runs - the caller
  // (voiceProfile.controller.js) awaits this whole function before it ever
  // uploads/deletes the local file, so by the time we get here the file is
  // guaranteed to still be on disk.
  const audioBuffer = fs.readFileSync(audioFilePath);

  let response;
  try {
    response = await forwardAudioForExtraction({
      audioBuffer,
      filename: path.basename(audioFilePath),
      contentType: resolveContentType(audioFilePath),
      language,
    });
  } catch (error) {
    if (isServiceUnavailable(error)) {
      if (error.isTimeout) logger.warn("Voice processing timed out", error.message);
      throw new AiServiceUnavailableError("Voice processing service is currently unavailable.");
    }
    logger.error("Voice processing failed", error);
    throw error;
  }

  logger.info("Voice processing completed");

  return {
    transcript: response.transcript,
    extractedProfile: response.extracted_profile,
    confidence: response.confidence,
  };
};

/**
 * processVoiceFieldAudio(audioFilePath, language, field) -> one field's result.
 *
 * The guided flow's counterpart to processVoiceProfileAudio. Same file handling
 * and same error classification - a service that is down is still an
 * AiServiceUnavailableError, so the controller's 503 handling is unchanged.
 *
 * @param {string} audioFilePath - local path; must still exist on disk
 * @param {string} language - "mr" | "hi" | "en"
 * @param {string} field - fullName | expectedPay | experienceYears | city | skills
 * @returns {Promise<{field:string, transcript:string, value:any, ok:boolean, reason:string, candidates:number[], confidence:number|null, usedLlm:boolean}>}
 */
export const processVoiceFieldAudio = async (audioFilePath, language = "mr", field) => {
  logger.info("Guided voice step started", { language, field });

  const audioBuffer = fs.readFileSync(audioFilePath);

  let response;
  try {
    response = await forwardAudioForFieldExtraction({
      audioBuffer,
      filename: path.basename(audioFilePath),
      contentType: resolveContentType(audioFilePath),
      language,
      field,
    });
  } catch (error) {
    if (isServiceUnavailable(error)) {
      if (error.isTimeout) logger.warn("Guided voice step timed out", error.message);
      throw new AiServiceUnavailableError("Voice processing service is currently unavailable.");
    }
    logger.error("Guided voice step failed", error);
    throw error;
  }

  logger.info("Guided voice step completed", { field, ok: response.ok });

  return {
    field: response.field,
    transcript: response.transcript,
    value: response.value ?? null,
    ok: Boolean(response.ok),
    reason: response.reason || "",
    candidates: response.candidates || [],
    confidence: response.confidence ?? null,
    usedLlm: Boolean(response.used_llm),
  };
};

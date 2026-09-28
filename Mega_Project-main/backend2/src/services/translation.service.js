import { translateText } from "./aiService.client.js";
import logger from "../utils/logger.js";

// A network-level failure (AI service unreachable) surfaces as a fetch()
// rejection with no .statusCode at all - distinct from FastAPI explicitly
// responding 503, but both must trigger the same source-language fallback
// below: job creation must never be blocked by translation being down.
const isServiceUnavailable = (error) => error.statusCode === undefined || error.statusCode === 503;

/**
 * Auto-translates input text from a source language into Marathi, Hindi,
 * and English, via the centralized Python AI service. Returns a trilingual
 * object { mr, hi, en }.
 *
 * Interface preserved exactly for existing callers:
 * translateTextToAllLanguages(text, sourceLang) -> {mr, hi, en}.
 *
 * @param {string} text - Source text to translate
 * @param {string} sourceLang - Source language ('mr', 'hi', or 'en')
 * @returns {Promise<{ mr: string, hi: string, en: string }>}
 */
export const translateTextToAllLanguages = async (text, sourceLang = "en") => {
  const result = {
    mr: sourceLang === "mr" ? text : "",
    hi: sourceLang === "hi" ? text : "",
    en: sourceLang === "en" ? text : "",
  };

  if (!text || typeof text !== "string" || text.trim() === "") {
    return result;
  }

  try {
    const translations = await translateText({ text, sourceLang });
    logger.info("Translation completed", { sourceLang });
    return translations;
  } catch (error) {
    // If the AI service call fails for ANY reason, fall back uniformly for
    // all targets - never return a mix of real translations and
    // source-language passthrough, which would look like a
    // partially-corrupted result. Covers both "not configured"/"unreachable"
    // (expected, logged as a warning) and genuine provider errors (logged as
    // an error) - job creation must not be blocked either way.
    if (isServiceUnavailable(error)) {
      logger.warn("AI service is unavailable - job saved with source-language text only.");
    } else {
      logger.error("Translation Service Error", error);
    }
    return { mr: result.mr || text, hi: result.hi || text, en: result.en || text };
  }
};

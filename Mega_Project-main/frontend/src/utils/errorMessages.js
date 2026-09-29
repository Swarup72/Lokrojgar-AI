// Turns a normalized {status, message, isNetworkError} (see api/client.js)
// into copy that is safe to show a user - never the raw backend `message`
// for known status codes, since that could leak internal/provider details
// (e.g. a raw Sarvam error string). Unrecognized statuses fall back to a
// generic message rather than exposing whatever the server actually said.

const DEFAULT_MESSAGES = {
  400: "Please check your input and try again.",
  401: "Your session has expired. Please log in again.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  409: "This action has already been completed.",
  413: "That file is too large. Please choose a smaller one.",
  429: "Too many attempts. Please wait a moment and try again.",
  503: "This service is temporarily unavailable. Please try again later.",
};

const VOICE_MESSAGES = {
  400: "Please check the audio file and try again.",
  403: "You are not authorized to create a voice profile.",
  413: "Audio file is too large. Please choose a smaller file (max 15MB).",
  503: "Voice AI is temporarily unavailable. Please try again later.",
};

const NETWORK_MESSAGE = "Unable to connect to the server. Please check your internet connection.";
const UNKNOWN_MESSAGE = "Something went wrong. Please try again.";

/**
 * @param {{status: number|null, isNetworkError: boolean}} normalizedError
 * @param {"voice"|"default"} [context]
 */
export function mapErrorToFriendlyMessage(normalizedError, context = "default") {
  if (!normalizedError || normalizedError.isNetworkError || normalizedError.status === null) {
    return NETWORK_MESSAGE;
  }

  const contextMessages = context === "voice" ? VOICE_MESSAGES : {};
  return contextMessages[normalizedError.status] || DEFAULT_MESSAGES[normalizedError.status] || UNKNOWN_MESSAGE;
}

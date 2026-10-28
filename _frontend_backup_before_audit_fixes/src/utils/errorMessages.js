// Turns a normalized {status, message, isNetworkError} (see api/client.js)
// into the TRANSLATION KEY of copy that is safe to show a user - never the raw
// backend `message` for known status codes, since that could leak internal/
// provider details (e.g. a raw Sarvam error string). Unrecognized statuses fall
// back to a generic key rather than exposing whatever the server actually said.
//
// A key, not a finished sentence: this module is imported by plain functions
// that have no React context, so it cannot call t() itself. The component that
// renders the error translates the key, which is what makes error copy appear
// in the user's own language instead of always in English.

const DEFAULT_KEYS = {
  400: "error.badRequest",
  401: "error.sessionExpired",
  403: "error.forbidden",
  404: "error.notFound",
  409: "error.conflict",
  413: "error.tooLarge",
  429: "error.tooManyAttempts",
  503: "error.unavailable",
};

const VOICE_KEYS = {
  400: "error.voice.badAudio",
  403: "error.voice.forbidden",
  413: "error.voice.tooLarge",
  503: "error.voice.unavailable",
};

const AUTH_KEYS = {
  400: "error.badRequest",
  401: "error.auth.invalidCredentials",
  403: "error.auth.blocked",
  404: "error.auth.userNotFound",
  409: "error.auth.alreadyExists",
  429: "error.tooManyAttempts",
  503: "error.unavailable",
};

const CONTEXT_KEYS = {
  voice: VOICE_KEYS,
  auth: AUTH_KEYS,
};

const NETWORK_KEY = "error.network";
const TIMEOUT_KEY = "error.timeout";
const UNKNOWN_KEY = "error.unknown";

/**
 * @param {{status: number|null, isNetworkError: boolean, isTimeout?: boolean}} normalizedError
 * @param {"voice"|"auth"|"default"} [context]
 * @returns {string} a translation key to pass to t()
 */
export function mapErrorToMessageKey(normalizedError, context = "default") {
  if (normalizedError?.isTimeout) {
    return TIMEOUT_KEY;
  }
  if (!normalizedError || normalizedError.isNetworkError || normalizedError.status === null) {
    return NETWORK_KEY;
  }

  const contextKeys = CONTEXT_KEYS[context] || {};
  return contextKeys[normalizedError.status] || DEFAULT_KEYS[normalizedError.status] || UNKNOWN_KEY;
}

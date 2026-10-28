// Single place that touches localStorage, so token/language persistence
// never gets duplicated or drifts between api/client.js and the contexts.

const ACCESS_TOKEN_KEY = "lokrozgar.accessToken";
const REFRESH_TOKEN_KEY = "lokrozgar.refreshToken";
const LANGUAGE_KEY = "lokrozgar.language";

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getStoredLanguage() {
  return localStorage.getItem(LANGUAGE_KEY);
}

export function setStoredLanguage(language) {
  localStorage.setItem(LANGUAGE_KEY, language);
}

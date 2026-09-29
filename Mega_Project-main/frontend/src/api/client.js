import axios from "axios";
import { getAccessToken, getRefreshToken, setTokens, clearTokens, getStoredLanguage } from "../utils/storage";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export const AUTH_EXPIRED_EVENT = "lokrozgar:auth-expired";

const client = axios.create({ baseURL: BASE_URL });

// Paths that must never trigger the 401-refresh dance themselves (refreshing
// in response to a failed refresh, or a failed login, would loop forever).
const REFRESH_EXEMPT_PATHS = ["/auth/login", "/auth/register", "/auth/refresh-token"];

client.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const language = getStoredLanguage();
  if (language) {
    config.params = { ...config.params, lang: language };
  }

  return config;
});

export function normalizeError(error) {
  // Idempotent: the response interceptor below already normalizes every
  // rejection before it reaches calling code, so call sites that (correctly,
  // defensively) call this again on an already-normalized error must get the
  // same object back - otherwise a real status code gets re-classified as a
  // network error, since the normalized shape has no `.response` to read.
  if (error && typeof error === "object" && "isNetworkError" in error && "status" in error) {
    return error;
  }
  if (!error.response) {
    return { status: null, message: error.message || "Network error", isNetworkError: true };
  }
  return {
    status: error.response.status,
    message: error.response.data?.message || error.message || "Unknown error",
    isNetworkError: false,
  };
}

// Refresh-token must bypass the shared `client` instance entirely - if it
// went through `client`, a 401 on the refresh call itself would re-enter
// this same interceptor and try to refresh again.
async function performTokenRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }
  const response = await axios.post(`${BASE_URL}/auth/refresh-token`, { refreshToken });
  return response.data.data; // {accessToken, refreshToken}
}

// Single-flight guard: several components can fire requests in parallel
// (e.g. a dashboard loading /users/me + /worker-profile/me + /jobs/recommended
// at once). If the access token expired, all of them get a 401 around the
// same time - without this guard each would kick off its own refresh call,
// burning through the backend's real rate limiter for no reason.
let refreshPromise = null;

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const normalized = normalizeError(error);
    const config = error.config;

    const isExemptPath = config && REFRESH_EXEMPT_PATHS.some((path) => config.url?.includes(path));

    if (normalized.status === 401 && config && !isExemptPath && !config._retry) {
      config._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = performTokenRefresh().finally(() => {
            refreshPromise = null;
          });
        }
        const newTokens = await refreshPromise;
        setTokens(newTokens);
        config.headers.Authorization = `Bearer ${newTokens.accessToken}`;
        return client(config);
      } catch {
        clearTokens();
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
        return Promise.reject(normalized);
      }
    }

    if (normalized.status === 401 && !isExemptPath && config?._retry) {
      // Already retried once after a refresh and still unauthorized -
      // the session is genuinely gone.
      clearTokens();
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }

    return Promise.reject(normalized);
  }
);

export default client;

import { PREFERRED_LANGUAGES, LANGUAGES } from "../constants.js";

/**
 * Middleware to detect and attach the requested language code ('mr', 'hi', 'en') onto req.lang.
 * Order of preference:
 * 1. Query param ?lang=
 * 2. Accept-Language header
 * 3. Cookie ('lang')
 * 4. User profile preferredLanguage (if authenticated)
 * 5. Default ('en')
 */
export const languageMiddleware = (req, res, next) => {
  let lang = null;

  // 1. Check Query Parameter
  if (req.query?.lang && typeof req.query.lang === "string") {
    lang = req.query.lang.toLowerCase().trim();
  }

  // 2. Check Accept-Language Header
  if (!lang && req.headers["accept-language"]) {
    const headerLang = req.headers["accept-language"]
      .split(",")[0]
      ?.split("-")[0]
      ?.toLowerCase()
      ?.trim();
    if (headerLang) {
      lang = headerLang;
    }
  }

  // 3. Check Cookie
  if (!lang && req.cookies?.lang) {
    lang = req.cookies.lang.toLowerCase().trim();
  }

  // 4. Check User Profile Preference
  if (!lang && req.user?.preferredLanguage) {
    lang = req.user.preferredLanguage;
  }

  // Validate against supported languages
  if (!lang || !PREFERRED_LANGUAGES.includes(lang)) {
    lang = LANGUAGES.ENGLISH; // Default fallback: 'en'
  }

  req.lang = lang;
  next();
};

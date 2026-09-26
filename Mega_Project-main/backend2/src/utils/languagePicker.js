/**
 * Extract localized string from a multilingual field object { mr, hi, en },
 * falling back to originalLanguage, then English, then any available translation.
 *
 * @param {Object|string} localizedField - Multilingual object or string value
 * @param {string} preferredLanguage - User's preferred language code ('mr', 'hi', 'en')
 * @param {string} originalLanguage - Content's original creation language code
 * @returns {string} Selected localized string text
 */
const pickLanguage = (localizedField, preferredLanguage = "en", originalLanguage = "en") => {
  if (!localizedField) return "";

  // Handle plain string fallback
  if (typeof localizedField === "string") return localizedField;

  if (typeof localizedField !== "object") return "";

  // 1. Try preferred language
  if (preferredLanguage && localizedField[preferredLanguage]?.trim()) {
    return localizedField[preferredLanguage].trim();
  }

  // 2. Fallback to originalLanguage
  if (originalLanguage && localizedField[originalLanguage]?.trim()) {
    return localizedField[originalLanguage].trim();
  }

  // 3. Fallback to English
  if (localizedField.en?.trim()) {
    return localizedField.en.trim();
  }

  // 4. Fallback to Marathi
  if (localizedField.mr?.trim()) {
    return localizedField.mr.trim();
  }

  // 5. Fallback to Hindi
  if (localizedField.hi?.trim()) {
    return localizedField.hi.trim();
  }

  return "";
};

export { pickLanguage };

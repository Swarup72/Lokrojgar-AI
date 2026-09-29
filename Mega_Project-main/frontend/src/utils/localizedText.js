// Mirrors backend2/src/utils/languagePicker.js's fallback order exactly, for
// the endpoints that return a raw {mr,hi,en} map without pre-localizing it
// server-side (jobs/nearby, jobs/employer/mine, jobs/recommended, the job
// inside recommended-workers, catalog items' nameMultilingual). Only
// GET /jobs/search pre-localizes into titleText/descriptionText - prefer
// that field when it's present instead of recomputing.

const FALLBACK_ORDER = ["en", "mr", "hi"];

/**
 * @param {{mr?:string, hi?:string, en?:string}|null|undefined} field
 * @param {"mr"|"hi"|"en"} preferredLang
 * @param {"mr"|"hi"|"en"} [originalLanguage]
 */
export function pickLocalizedText(field, preferredLang, originalLanguage) {
  if (!field) return "";

  const order = [preferredLang, originalLanguage, ...FALLBACK_ORDER].filter(Boolean);
  for (const lang of order) {
    if (field[lang]) return field[lang];
  }
  return "";
}

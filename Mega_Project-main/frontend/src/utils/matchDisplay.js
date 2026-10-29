/**
 * Display helpers for recommendation cards.
 *
 * The AI service reports `overall_score` on a 0-100 scale (already a percentage),
 * so nothing here multiplies by 100.
 */

/**
 * Returns the score as a whole number 0-100, or null when it is missing or not a
 * usable number (null, undefined, NaN, Infinity, strings, objects).
 * 0 is a valid score and is preserved.
 */
export function normalizeMatchScore(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Chooses which translation key explains the skill situation of a job card.
 *  - "matched"          -> null (the matching skill chips are shown instead)
 *  - worker has no skills -> prompt to add skills
 *  - worker has skills, none close to this job's -> friendly "no close match"
 *  - job lists no skills   -> "skills not specified"
 */
export function getSkillMessageKey({ skillMatchStatus, matchingSkills, job } = {}) {
  if (skillMatchStatus === "matched" || (Array.isArray(matchingSkills) && matchingSkills.length > 0)) {
    return null;
  }
  if (skillMatchStatus === "no-worker-skills") return "recommendations.addSkillsPrompt";
  if (skillMatchStatus === "unmatched" || (Array.isArray(job?.skillIds) && job.skillIds.length > 0)) {
    return "recommendations.noMatchingSkills";
  }
  return "recommendations.skillsNotSpecified";
}

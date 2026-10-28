/**
 * LokRozgar AI - Recommendation Scoring & Skill-First Ranking
 *
 * Deterministic frontend utility to adjust recommendation rankings:
 * - Jobs with verified matching skills rank above jobs without matching skills.
 * - Genuine skill mismatches (where worker has skills and job has required skills,
 *   but 0 match) receive a substantial penalty (e.g. -35 points) to reflect lack
 *   of qualifications.
 * - Jobs with missing or unspecified required skills are marked unknown and NOT
 *   penalized as a confirmed mismatch.
 * - Cold-start workers (no skills in profile) are marked and not penalized.
 * - Original backend matchScore is always preserved intact.
 */

export function extractSkillText(s) {
  if (!s) return "";
  if (typeof s === "string") return s.trim().toLowerCase();
  const nameVal = s.name || s.skillName || s.skill?.name;
  if (typeof nameVal === "string") return nameVal.trim().toLowerCase();
  if (nameVal && typeof nameVal === "object") {
    const val = nameVal.en || nameVal.mr || nameVal.hi || Object.values(nameVal)[0] || "";
    return typeof val === "string" ? val.trim().toLowerCase() : "";
  }
  return "";
}

/**
 * Computes deterministic skill-first recommendation metrics for a job match.
 *
 * @param {{
 *   match: {
 *     job?: { skillIds?: Array<any> },
 *     matchScore?: number,
 *     matchFactors?: Record<string, number|null>,
 *     explanation?: any
 *   },
 *   workerSkills?: Array<any>
 * }} params
 * @returns {{
 *   skillMatchStatus: 'matched' | 'unmatched' | 'unknown' | 'no-worker-skills',
 *   matchingSkills: Array<any>,
 *   missingSkills: Array<any>,
 *   originalMatchScore: number,
 *   recommendationScore: number,
 *   hasSkillMatch: boolean,
 *   penaltyApplied: number
 * }}
 */
export function deriveRecommendationScore({ match, workerSkills }) {
  const originalMatchScore = typeof match?.matchScore === "number" ? match.matchScore : 0;
  const job = match?.job || {};
  const requiredSkills = Array.isArray(job.skillIds) ? job.skillIds : [];
  const workerSkillsList = Array.isArray(workerSkills) ? workerSkills : [];

  const hasWorkerSkills = workerSkillsList.length > 0;
  const hasJobSkills = requiredSkills.length > 0;

  // Build worker skill lookups
  const workerIdSet = new Set();
  const workerNameSet = new Set();

  workerSkillsList.forEach((ws) => {
    const id = ws.skillId?._id || ws.skillId || ws._id;
    if (id) workerIdSet.add(String(id));
    const name = extractSkillText(ws.skillId || ws);
    if (name) workerNameSet.add(name);
  });

  const matchingSkills = [];
  const missingSkills = [];

  requiredSkills.forEach((s) => {
    const sId = String(s._id || s);
    const sName = extractSkillText(s);
    if (workerIdSet.has(sId) || (sName && workerNameSet.has(sName))) {
      matchingSkills.push(s);
    } else {
      missingSkills.push(s);
    }
  });

  const skillFactor = match?.matchFactors?.skill;
  const hasSkillFactor = typeof skillFactor === "number";

  let skillMatchStatus = "unknown";
  let recommendationScore = originalMatchScore;

  if (!hasWorkerSkills) {
    skillMatchStatus = "no-worker-skills";
    recommendationScore = originalMatchScore;
  } else if (!hasJobSkills) {
    skillMatchStatus = "unknown";
    recommendationScore = originalMatchScore;
  } else {
    // Both worker and job have skills
    const isMatched = matchingSkills.length > 0 || (hasSkillFactor && skillFactor > 0);
    if (isMatched) {
      skillMatchStatus = "matched";
      recommendationScore = originalMatchScore;
    } else {
      // Confirmed mismatch
      skillMatchStatus = "unmatched";
      const PENALTY = 35;
      recommendationScore = Math.max(0, Math.round(originalMatchScore - PENALTY));
    }
  }

  return {
    skillMatchStatus,
    matchingSkills,
    missingSkills,
    originalMatchScore,
    recommendationScore,
    hasSkillMatch: skillMatchStatus === "matched",
    penaltyApplied: skillMatchStatus === "unmatched" ? originalMatchScore - recommendationScore : 0,
  };
}

/**
 * Sorts recommendation matches prioritizing verified skill matches first,
 * then recommendationScore descending, then originalMatchScore descending.
 *
 * @param {Array<any>} matches
 * @param {Array<any>} workerSkills
 * @returns {Array<any>}
 */
export function sortRecommendedMatches(matches, workerSkills) {
  if (!Array.isArray(matches)) return [];

  const decorated = matches
    .filter((m) => m?.job?._id)
    .map((match) => {
      const scoring = deriveRecommendationScore({ match, workerSkills });
      return {
        ...match,
        ...scoring,
      };
    });

  return decorated.sort((a, b) => {
    // 1. Matched jobs rank strictly above unmatched jobs
    if (a.hasSkillMatch && !b.hasSkillMatch) return -1;
    if (!a.hasSkillMatch && b.hasSkillMatch) return 1;

    // 2. Both matched or both not matched: sort by recommendationScore descending
    if (b.recommendationScore !== a.recommendationScore) {
      return b.recommendationScore - a.recommendationScore;
    }

    // 3. Tie-break: originalMatchScore descending
    return (b.originalMatchScore || 0) - (a.originalMatchScore || 0);
  });
}


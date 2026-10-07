/**
 * A JS mirror of the AI service's skill score, for asserting the ORDERING that
 * sub-skills are supposed to produce without standing up FastAPI.
 *
 * Deliberately a copy of ai-service/app/matching/skill_match.py's formula
 * (|matched| / |required| * 100) rather than a re-derivation: the point of the
 * assertion is that the frozen formula ALREADY ranks
 * parent+sub > parent only > unrelated, so nothing in the ranking had to change.
 * The Python implementation remains the source of truth and has its own tests.
 */
export function calculateSkillScoreForTest(workerSkillIds, jobSkillIds) {
  const required = new Set(jobSkillIds.map(String));
  if (required.size === 0) return 0;
  const worker = new Set(workerSkillIds.map(String));
  let matched = 0;
  for (const skill of required) {
    if (worker.has(skill)) matched += 1;
  }
  return (matched / required.size) * 100;
}

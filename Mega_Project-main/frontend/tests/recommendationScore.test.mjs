import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveRecommendationScore,
  sortRecommendedMatches,
  extractSkillText,
} from "../src/utils/recommendationScoring.js";

test("extractSkillText extracts string or localized object correctly", () => {
  assert.equal(extractSkillText("Plumber"), "plumber");
  assert.equal(extractSkillText({ name: "Electrician" }), "electrician");
  assert.equal(extractSkillText({ name: { en: "Carpentry", mr: "सुतारकाम" } }), "carpentry");
  assert.equal(extractSkillText(null), "");
});

test("Scenario 1: Verified skill match ranks and scores without penalty", () => {
  const match = {
    job: {
      _id: "job-1",
      skillIds: [{ _id: "s1", name: "Plumbing" }],
    },
    matchScore: 80,
    matchFactors: { skill: 100, location: 100 },
  };

  const workerSkills = [
    { skillId: { _id: "s1", name: "Plumbing" } },
  ];

  const result = deriveRecommendationScore({ match, workerSkills });

  assert.equal(result.skillMatchStatus, "matched");
  assert.equal(result.hasSkillMatch, true);
  assert.equal(result.originalMatchScore, 80);
  assert.equal(result.recommendationScore, 80);
  assert.equal(result.penaltyApplied, 0);
  assert.equal(result.matchingSkills.length, 1);
});

test("Scenario 2: Unmatched required skills receives deterministic penalty", () => {
  const match = {
    job: {
      _id: "job-2",
      skillIds: [{ _id: "s2", name: "Welding" }],
    },
    matchScore: 75,
    matchFactors: { skill: 0, location: 100, availability: 100 },
  };

  const workerSkills = [
    { skillId: { _id: "s1", name: "Plumbing" } },
  ];

  const result = deriveRecommendationScore({ match, workerSkills });

  assert.equal(result.skillMatchStatus, "unmatched");
  assert.equal(result.hasSkillMatch, false);
  assert.equal(result.originalMatchScore, 75);
  assert.equal(result.recommendationScore, 40); // 75 - 35 = 40
  assert.equal(result.penaltyApplied, 35);
  assert.equal(result.matchingSkills.length, 0);
  assert.equal(result.missingSkills.length, 1);
});

test("Scenario 3: Job with unspecified/unknown required skills is NOT penalized as a mismatch", () => {
  const match = {
    job: {
      _id: "job-3",
      skillIds: [], // unspecified
    },
    matchScore: 70,
    matchFactors: { skill: null, location: 90 },
  };

  const workerSkills = [
    { skillId: { _id: "s1", name: "Plumbing" } },
  ];

  const result = deriveRecommendationScore({ match, workerSkills });

  assert.equal(result.skillMatchStatus, "unknown");
  assert.equal(result.hasSkillMatch, false);
  assert.equal(result.originalMatchScore, 70);
  assert.equal(result.recommendationScore, 70); // unpenalized
  assert.equal(result.penaltyApplied, 0);
});

test("Scenario 4: Cold-start worker with no skills is marked no-worker-skills and NOT penalized", () => {
  const match = {
    job: {
      _id: "job-4",
      skillIds: [{ _id: "s1", name: "Plumbing" }],
    },
    matchScore: 65,
    matchFactors: { skill: 0, location: 80 },
  };

  const workerSkills = []; // no skills in profile

  const result = deriveRecommendationScore({ match, workerSkills });

  assert.equal(result.skillMatchStatus, "no-worker-skills");
  assert.equal(result.hasSkillMatch, false);
  assert.equal(result.originalMatchScore, 65);
  assert.equal(result.recommendationScore, 65); // unpenalized
  assert.equal(result.penaltyApplied, 0);
});

test("Scenario 5: sortRecommendedMatches puts verified skill matches strictly above unmatched jobs", () => {
  const matches = [
    {
      job: { _id: "j-unmatched", skillIds: [{ _id: "s2", name: "Welding" }] },
      matchScore: 85, // Higher raw score initially from location/availability
      matchFactors: { skill: 0, location: 100 },
    },
    {
      job: { _id: "j-matched", skillIds: [{ _id: "s1", name: "Plumbing" }] },
      matchScore: 70, // Lower raw score initially
      matchFactors: { skill: 100, location: 70 },
    },
  ];

  const workerSkills = [
    { skillId: { _id: "s1", name: "Plumbing" } },
  ];

  const sorted = sortRecommendedMatches(matches, workerSkills);

  assert.equal(sorted[0].job._id, "j-matched", "Matched job must rank first");
  assert.equal(sorted[1].job._id, "j-unmatched", "Unmatched job must rank second");
  assert.equal(sorted[1].recommendationScore, 50); // 85 - 35 = 50
  assert.equal(sorted[1].originalMatchScore, 85, "Original match score is preserved");
});


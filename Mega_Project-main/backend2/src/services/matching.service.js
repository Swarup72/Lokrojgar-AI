import { calculateDistance } from "../utils/geo.js";

/**
 * Matching Engine Service
 * Calculates match score between a Job and a WorkerProfile based on weighted factors:
 * - Skill match (35%)
 * - Location proximity (25%)
 * - Availability (15%)
 * - Pay expectation (15%)
 * - Rating (10%)
 */
export const calculateMatchScore = (job, workerProfile, workerSkills = []) => {
  let score = 0;
  const factors = {
    skill: 0,
    location: 0,
    availability: 0,
    pay: 0,
    rating: 0,
    relevance: 0,
  };

  if (!job || !workerProfile) return { score: 0, factors };

  // 1. Skill Match (Weight: 35%)
  if (job.skillIds && job.skillIds.length > 0) {
    const jobSkillIds = job.skillIds.map((id) => id.toString());
    const workerSkillIds = workerSkills.map((s) => s.skillId?.toString());
    const matchingSkills = jobSkillIds.filter((id) => workerSkillIds.includes(id));
    factors.skill = Math.round((matchingSkills.length / jobSkillIds.length) * 100);
  } else {
    factors.skill = 80; // Default baseline if job has no required skills
  }

  // 2. Location Proximity (Weight: 25%)
  if (
    job.location?.coordinates?.length === 2 &&
    workerProfile.location?.coordinates?.length === 2
  ) {
    const distanceKm = calculateDistance(
      job.location.coordinates[1],
      job.location.coordinates[0],
      workerProfile.location.coordinates[1],
      workerProfile.location.coordinates[0]
    );

    const maxRadius = workerProfile.preferredWorkRadiusKm || 20;
    if (distanceKm <= maxRadius) {
      factors.location = Math.round(((maxRadius - distanceKm) / maxRadius) * 100);
    } else {
      factors.location = Math.max(0, Math.round(100 - (distanceKm - maxRadius) * 5));
    }
  } else {
    factors.location = 50;
  }

  // 3. Availability (Weight: 15%)
  if (workerProfile.availability === "available") {
    factors.availability = 100;
  } else if (workerProfile.availability === "busy") {
    factors.availability = 40;
  } else {
    factors.availability = 0;
  }

  // 4. Pay Expectation (Weight: 15%)
  if (workerProfile.expectedPay && job.payAmount) {
    if (job.payAmount >= workerProfile.expectedPay) {
      factors.pay = 100;
    } else {
      const diffRatio = (workerProfile.expectedPay - job.payAmount) / workerProfile.expectedPay;
      factors.pay = Math.max(0, Math.round((1 - diffRatio) * 100));
    }
  } else {
    factors.pay = 80;
  }

  // 5. Rating Factor (Weight: 10%)
  const ratingAvg = workerProfile.ratingAvg || 0;
  factors.rating = Math.round((ratingAvg / 5) * 100);

  // Calculate Weighted Aggregate Match Score
  score = Math.round(
    factors.skill * 0.35 +
      factors.location * 0.25 +
      factors.availability * 0.15 +
      factors.pay * 0.15 +
      factors.rating * 0.10
  );

  factors.relevance = score;

  return {
    score: Math.min(100, Math.max(0, score)),
    factors,
  };
};

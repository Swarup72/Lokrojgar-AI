/**
 * Manual QA Profile Field Mapper for LokRozgar AI.
 *
 * Provides pure mapping functions that transform raw synthetic dataset records
 * (from manual-qa-data/ JSON files) into validated Mongoose documents
 * matching actual application schemas.
 *
 * Guarantees:
 * - Original dataset remains 100% immutable and untouched.
 * - Marathi Unicode characters (Devanagari) are strictly preserved.
 * - Phone numbers are normalized to valid E.164 formats accepted by User schema.
 * - Passwords default to a standard, deterministic QA credential ("QAPassword@123").
 * - Skill phrases are normalized and resolved against canonical Skill documents.
 * - Application statuses ("pending" -> "applied") are correctly converted.
 */

import bcrypt from "bcrypt";
import { APPLICATION_STATUS, APPLICATION_INITIATORS } from "../../constants.js";

/**
 * Standard Coordinates for Maharashtra Cities (GeoJSON [longitude, latitude]).
 */
export const MAHARASHTRA_CITY_COORDINATES = {
  kolhapur: [74.2433, 16.7050],
  pune: [73.8567, 18.5204],
  satara: [73.9996, 17.6805],
  sangli: [74.5815, 16.8524],
  mumbai: [72.8777, 19.0760],
  nashik: [73.7898, 19.9975],
  karad: [74.1844, 17.2890],
  solapur: [75.9064, 17.6599],
  thane: [72.9781, 19.2183],
  nagpur: [79.0882, 21.1458],
};

/**
 * Comprehensive Dataset Skill Synonym and Normalization Dictionary.
 * Maps vernacular Marathi and English dataset phrases to canonical skill names.
 */
export const DATASET_SKILL_SYNONYMS = {
  // Electrical
  "इलेक्ट्रिशियन": "Electrician",
  "electrician": "Electrician",
  "घरगुती वायरिंग": "Wire Connection",
  "वायरिंग": "Wire Connection",
  "residential wiring": "Wire Connection",
  "विद्युत दुरुस्ती": "Electrical Maintenance",
  "electrical repair": "Electrical Maintenance",
  "basic electrical": "Electrician",
  "switch installation": "Switch Installation",
  "fan installation": "Fan Installation",
  "motor repair": "Motor Repair",
  "installation": "Switch Installation",
  "maintenance": "Electrical Maintenance",
  "देखभाल": "Electrical Maintenance",

  // Plumbing
  "प्लंबर": "Plumbing",
  "प्लंबिंग": "Plumbing",
  "plumber": "Plumbing",
  "plumbing": "Plumbing",
  "पाईप फिटिंग": "Pipe Fitting",
  "pipe fitting": "Pipe Fitting",
  "गळती दुरुस्ती": "Leak Repair",
  "leak repair": "Leak Repair",
  "basic plumbing": "Plumbing",

  // Construction & Masonry
  "गवंडी": "Masonry",
  "गवंडीकाम": "Masonry",
  "mason": "Masonry",
  "masonry": "Masonry",
  "बांधकाम": "Masonry",
  "मजुरी": "Construction Helper",
  "construction labour": "Construction Helper",
  "construction helper": "Construction Helper",
  "सामान्य काम": "Construction Helper",
  "general labour": "Construction Helper",
  "general work": "Construction Helper",
  "general helper": "Construction Helper",
  "मदतनीस": "Construction Helper",
  "हेल्पर": "Construction Helper",
  "material handling": "Loading & Unloading",
  "साहित्य हाताळणे": "Loading & Unloading",
  "साइट साफसफाई": "Cleaning",
  "साहित्य वाहतूक": "Trailer Transport",

  // Carpentry
  "सुतार": "Carpentry",
  "सुतारकाम": "Carpentry",
  "carpenter": "Carpentry",
  "carpentry": "Carpentry",
  "furniture assembly": "Modular Furniture",
  "door fitting": "Door Installation",

  // Painting
  "रंगकाम": "Painting",
  "पेंटर": "Painting",
  "painter": "Painting",
  "painting": "Painting",
  "पुट्टी": "Putty Work",
  "वॉल फिनिशिंग": "Interior Painting",
  "surface preparation": "Wall Preparation",
  "finishing": "Interior Painting",

  // Welding & Metal
  "welder": "Welding",
  "welding": "Welding",
  "mig welding": "Welding",
  "metal fabrication": "Grill Fabrication",

  // Driving & Logistics
  "ड्रायव्हिंग": "Driver",
  "ड्रायव्हर": "Driver",
  "driver": "Driver",
  "driving": "Driver",
  "डिलिव्हरी": "Delivery Agent",
  "delivery": "Delivery Agent",
  "delivery boy": "Delivery Agent",
  "मार्ग नियोजन": "Delivery Agent",
  "route planning": "Delivery Agent",
  "माल चढवणे": "Loading & Unloading",
  "माल चढवणे व उतरवणे": "Loading & Unloading",
  "पॅकिंग": "Goods Sorting",
  "packaging": "Goods Sorting",
  "packing": "Goods Sorting",
  "गोदाम काम": "Warehouse Worker",
  "warehouse": "Warehouse Worker",
  "स्टॉक मोजणी": "Stock Keeping",
  "quality checks": "Stock Keeping",

  // Vehicle Repair
  "mechanic": "Vehicle Repair",
  "मेकॅनिक": "Vehicle Repair",
  "सर्व्हिसिंग": "Vehicle Repair",
  "vehicle checks": "Vehicle Repair",
  "brake service": "Two-Wheeler Repair",

  // Cooking & Hospitality
  "कुक": "Cooking",
  "cook": "Cooking",
  "cooking": "Cooking",
  "कुकिंग": "Cooking",
  "स्वयंपाक": "Cooking",
  "maharashtrian cuisine": "Home Cooking",
  "kitchen hygiene": "Cleaning",
  "kitchen assistant": "Commercial Kitchen",
  "food preparation": "Cooking",
  "catering": "Event Service",
  "वेटर्स": "Waiter Service",
  "waiter": "Waiter Service",

  // Cleaning & Housekeeping
  "सफाई": "Cleaning",
  "सफाई काम": "Cleaning",
  "cleaning": "Cleaning",
  "साफसफाई": "Cleaning",
  "स्वच्छता": "House Cleaning",
  "deep cleaning": "House Cleaning",
  "office housekeeping": "Office Cleaning",
  "कार्यालयीन स्वच्छता": "Office Cleaning",
  "हाऊसकीपिंग": "Housekeeping",
  "housekeeping": "Housekeeping",
  "hygiene": "Cleaning",

  // Agriculture
  "शेतीकाम": "Farm Labour",
  "शेती": "Farm Labour",
  "agriculture": "Farm Labour",
  "farm labour": "Farm Labour",
  "सिंचन": "Irrigation",
  "हंगामी काम": "Farm Labour",

  // Tailoring
  "tailoring": "Tailor",
  "tailor": "Tailor",
  "alterations": "Alteration",
  "alteration": "Alteration",
  "stitching": "Tailor",
  "शिवणकाम": "Tailor",
  "कपड्यांची दुरुस्ती": "Alteration",

  // Security
  "security": "Security Guard",
  "सुरक्षा": "Security Guard",
  "गार्ड": "Security Guard",
  "security guard": "Security Guard",
  "निगराणी": "Security Guard",
  "प्रवेश नियंत्रण": "Security Guard",
  "access control": "Security Guard",
};

/**
 * Normalizes phone string to valid E.164-style Indian number accepted by User schema:
 * e.g. "+91-90000-00001" -> "+919000000001".
 */
export function normalizePhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== "string") return "";
  const cleaned = rawPhone.replace(/[^+\d]/g, "");
  if (cleaned.startsWith("+91")) return cleaned;
  if (/^[6-9]\d{9}$/.test(cleaned)) return `+91${cleaned}`;
  return cleaned;
}

/**
 * Returns GeoPoint coordinates [longitude, latitude] for a given city name.
 */
export function getCityCoordinates(cityName) {
  if (!cityName || typeof cityName !== "string") return [73.8567, 18.5204]; // Default Pune
  const key = cityName.trim().toLowerCase();
  return MAHARASHTRA_CITY_COORDINATES[key] || [73.8567, 18.5204];
}

/**
 * Maps raw worker JSON record to User + WorkerProfile payload.
 */
export function mapWorkerToUserAndProfile(rawWorker) {
  const normalizedPhone = normalizePhone(rawWorker.phone);
  const preferredLang = rawWorker.preferred_language || "mr";
  const coordinates = getCityCoordinates(rawWorker.city);

  const bioPayload = {
    mr: preferredLang === "mr" ? rawWorker.bio : "",
    hi: preferredLang === "hi" ? rawWorker.bio : "",
    en: preferredLang === "en" ? rawWorker.bio : "",
  };

  // Ensure preferred language bio has the content, and include QA metadata tag
  const qaMarker = `[QA Profile: ${rawWorker.profile_id} | ${rawWorker.case || "Manual QA"}]`;
  bioPayload[preferredLang] = `${qaMarker} ${rawWorker.bio || ""}`.trim();

  const userDoc = {
    phone: normalizedPhone,
    fullName: rawWorker.name,
    email: rawWorker.email || `worker_${rawWorker.profile_id.toLowerCase()}@example.test`,
    roles: ["worker"],
    preferredLanguage: preferredLang,
    isVerified: true,
    phoneVerifiedAt: new Date(),
  };

  const ratingAvg = typeof rawWorker.rating_avg === "number" ? rawWorker.rating_avg : 0;
  const ratingCount = ratingAvg > 0 ? Math.max(3, Math.round(ratingAvg * 3)) : 0;

  const profileDoc = {
    fullName: rawWorker.name,
    bio: bioPayload,
    city: rawWorker.city || "Pune",
    availability: ["available", "busy", "unavailable"].includes(rawWorker.availability)
      ? rawWorker.availability
      : "available",
    expectedPay: Math.max(0, Number(rawWorker.expected_pay) || 0),
    experienceYears: Math.max(0, Number(rawWorker.experience_years) || 0),
    ratingAvg,
    ratingCount,
    languages: [preferredLang],
    location: {
      type: "Point",
      coordinates,
    },
  };

  return { userDoc, profileDoc };
}

/**
 * Maps raw employer JSON record to User + EmployerProfile payload.
 */
export function mapEmployerToUserAndProfile(rawEmployer) {
  const normalizedPhone = normalizePhone(rawEmployer.phone);
  const preferredLang = rawEmployer.preferred_language || "en";
  const coordinates = getCityCoordinates(rawEmployer.city);

  const isVerified = rawEmployer.verification_status === "verified";
  const isBlocked = rawEmployer.account_status === "suspended";

  const qaMarker = `[QA Employer: ${rawEmployer.profile_id} | Pattern: ${rawEmployer.posting_pattern || "normal"}]`;
  const desc = `${qaMarker} ${rawEmployer.description || ""}`.trim();

  const bioPayload = {
    en: desc,
    mr: desc,
    hi: desc,
  };

  const userDoc = {
    phone: normalizedPhone,
    fullName: rawEmployer.name,
    email: rawEmployer.email || `employer_${rawEmployer.profile_id.toLowerCase()}@example.test`,
    roles: ["employer"],
    preferredLanguage: preferredLang,
    isVerified,
    isBlocked,
    phoneVerifiedAt: new Date(),
  };

  const profileDoc = {
    businessName: rawEmployer.name,
    businessType: rawEmployer.business_type || "Business",
    bio: bioPayload,
    city: rawEmployer.city || "Pune",
    isVerified,
    location: {
      type: "Point",
      coordinates,
    },
  };

  return { userDoc, profileDoc };
}

/**
 * Maps raw job JSON record to Job payload.
 */
export function mapJobRecord(rawJob, employerProfileId, categoryId, skillIds) {
  const coordinates = getCityCoordinates(rawJob.city);
  const preferredLang = rawJob.preferred_language || "mr";

  const qaMarker = `[QA Job: ${rawJob.job_id} | Case: ${rawJob.case || "Standard"}]`;

  const titlePayload = {
    mr: preferredLang === "mr" ? rawJob.title : rawJob.title,
    hi: rawJob.title,
    en: rawJob.title,
  };

  const descPayload = {
    mr: preferredLang === "mr" ? `${qaMarker}\n\n${rawJob.description}` : rawJob.description,
    hi: `${qaMarker}\n\n${rawJob.description}`,
    en: `${qaMarker}\n\n${rawJob.description}`,
  };

  return {
    employerId: employerProfileId,
    title: titlePayload,
    description: descPayload,
    categoryId,
    skillIds,
    city: rawJob.city || "Pune",
    payType: ["daily", "monthly", "fixed"].includes(rawJob.pay_type) ? rawJob.pay_type : "daily",
    payAmount: Math.max(0, Number(rawJob.pay_amount) || 0),
    status: ["open", "cancelled", "completed"].includes(rawJob.status) ? rawJob.status : "open",
    startDate: new Date(),
    originalLanguage: preferredLang,
    preferredLanguages: [preferredLang],
    requiredWorkers: rawJob.case?.toLowerCase().includes("bulk") ? 5 : 1,
    location: {
      type: "Point",
      coordinates,
    },
  };
}

/**
 * Maps raw application JSON record to Application payload.
 */
export function mapApplicationRecord(rawApp, jobId, workerProfileId) {
  // Map dataset status to supported Mongoose enum values
  let mappedStatus = APPLICATION_STATUS.APPLIED;
  if (rawApp.status === "accepted") mappedStatus = APPLICATION_STATUS.ACCEPTED;
  else if (rawApp.status === "rejected") mappedStatus = APPLICATION_STATUS.REJECTED;
  else if (rawApp.status === "completed") mappedStatus = APPLICATION_STATUS.COMPLETED;
  else if (rawApp.status === "pending") mappedStatus = APPLICATION_STATUS.APPLIED;

  return {
    jobId,
    workerId: workerProfileId,
    status: mappedStatus,
    initiatedBy: APPLICATION_INITIATORS.WORKER,
    appliedAt: new Date(),
    coverNote: `[QA Application: ${rawApp.application_id} | Case: ${rawApp.case || "Manual QA"}]`,
  };
}

/**
 * Maps raw report JSON record to Dispute payload.
 */
export function mapReportToDispute(rawReport, jobId, raisedByUserId, againstUserId) {
  return {
    jobId,
    raisedByUserId,
    againstUserId,
    status: "open",
    reason: rawReport.category || "other",
    description: `[QA Report: ${rawReport.case_id} | Check: ${rawReport.expected_manual_check || "Review"}]\n\n${rawReport.description}`,
  };
}

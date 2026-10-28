import crypto from "crypto";
import mongoose from "mongoose";

/**
 * Standard Maharashtra coordinates for the 7 cities represented in the QA dataset.
 * Format: [longitude, latitude] as required by GeoJSON Point specification.
 */
export const CITY_COORDINATES = {
  Kolhapur: [74.2433, 16.705],
  Pune: [73.8567, 18.5204],
  Satara: [74.0183, 17.6805],
  Sangli: [74.5815, 16.8524],
  Mumbai: [72.8777, 19.076],
  Nashik: [73.7898, 19.9975],
  Karad: [74.1844, 17.2891],
};

/**
 * Deterministic MongoDB ObjectId generation from a namespace prefix and synthetic ID.
 * Generates identical, stable 24-hex-char ObjectIds across runs (e.g. W001, E001, J001).
 */
export function deterministicId(prefix, key) {
  const hash = crypto
    .createHash("md5")
    .update(`lokrozgar_qa_${prefix}_${String(key).trim()}`)
    .digest("hex");
  return new mongoose.Types.ObjectId(hash.substring(0, 24));
}

/**
 * Multilingual aliases mapping dataset free-text skills to canonical catalog skill English names.
 */
export const SKILL_ALIASES = {
  // Electrician & Wiring
  "इलेक्ट्रिशियन": "Electrician",
  "electrician": "Electrician",
  "घरगुती वायरिंग": "Wire Connection",
  "घराची वायरिंग": "Wire Connection",
  "residential wiring": "Wire Connection",
  "वायरिंग": "Wire Connection",
  "wiring": "Wire Connection",
  "विद्युत दुरुस्ती": "Electrical Maintenance",
  "electrical repair": "Electrical Maintenance",
  "basic electrical": "Electrician",
  "maintenance": "Electrical Maintenance",
  "देखभाल": "Electrical Maintenance",
  "factory maintenance": "Electrical Maintenance",
  "fan installation": "Fan Installation",
  "switchboard installation": "Switch Installation",

  // Plumbing
  "प्लंबिंग": "Plumbing",
  "plumbing": "Plumbing",
  "पाईप फिटिंग": "Pipe Fitting",
  "pipe fitting": "Pipe Fitting",
  "गळती दुरुस्ती": "Leak Repair",
  "leak repair": "Leak Repair",
  "basic plumbing": "Plumbing",
  "tap installation": "Tap Installation",

  // Masonry & Construction
  "गवंडी": "Masonry",
  "गवंडीकाम": "Masonry",
  "mason": "Masonry",
  "masonry": "Masonry",
  "बांधकाम": "Masonry",
  "मजुरी": "Farm Labour",
  "construction labour": "Masonry",
  "general labour": "Farm Labour",
  "general work": "Farm Labour",
  "general helper": "Farm Labour",
  "सामान्य काम": "Farm Labour",
  "मदतनीस": "Farm Labour",
  "material handling": "Loading & Unloading",
  "साहित्य हाताळणे": "Loading & Unloading",
  "साहित्य वाहतूक": "Loading & Unloading",
  "माल चढवणे व उतरवणे": "Loading & Unloading",
  "loading & unloading": "Loading & Unloading",
  "plastering": "Plastering",
  "tile work": "Tile Work",
  "site cleaning": "House Cleaning",
  "साइट साफसफाई": "House Cleaning",

  // Painting & Finishing
  "रंगकाम": "Painting",
  "painting": "Painting",
  "पुट्टी": "Putty Work",
  "पुट्टी काम": "Putty Work",
  "putty work": "Putty Work",
  "वॉल फिनिशिंग": "Wall Preparation",
  "wall preparation": "Wall Preparation",
  "surface preparation": "Wall Preparation",
  "finishing": "Putty Work",
  "interior painting": "Interior Painting",
  "exterior painting": "Exterior Painting",

  // Welding & Fabrication
  "वेल्डिंग": "Welding",
  "welder": "Welding",
  "welding": "Welding",
  "mig welding": "Welding",
  "metal fabrication": "Grill Fabrication",
  "grill fabrication": "Grill Fabrication",

  // Driving & Delivery & Transport
  "ड्रायव्हिंग": "Driver",
  "driving": "Driver",
  "driver": "Driver",
  "चालक": "Driver",
  "डिलिव्हरी": "Delivery Agent",
  "delivery": "Delivery Agent",
  "delivery agent": "Delivery Agent",
  "delivery boy": "Delivery Agent",
  "डिलिव्हरी बॉय": "Delivery Agent",
  "मार्ग नियोजन": "Delivery Agent",
  "route planning": "Delivery Agent",
  "टेंपो चालक": "Tempo Driver",
  "tempo driver": "Tempo Driver",
  "tractor driving": "Tractor Driving",
  "ट्रॅक्टर चालवणे": "Tractor Driving",

  // Domestic, Housekeeping & Cleaning
  "स्वच्छता": "House Cleaning",
  "cleaning": "House Cleaning",
  "deep cleaning": "House Cleaning",
  "house cleaning": "House Cleaning",
  "घरकाम": "Housekeeping",
  "हाऊसकीपिंग": "Housekeeping",
  "housekeeping": "Housekeeping",
  "office housekeeping": "Office Cleaning",
  "office cleaning": "Office Cleaning",
  "कार्यालयीन स्वच्छता": "Office Cleaning",
  "कार्यालय सफाई": "Office Cleaning",
  "साफसफाई": "House Cleaning",
  "hygiene": "House Cleaning",
  "kitchen hygiene": "House Cleaning",

  // Cooking & Hospitality
  "cook": "Cooking",
  "cooking": "Cooking",
  "स्वयंपाक": "Cooking",
  "catering": "Event Service",
  "maharashtrian cuisine": "Home Cooking",
  "home cooking": "Home Cooking",
  "kitchen assistant": "Dishwashing",
  "food preparation": "Roti & Sabzi Making",
  "waiter": "Waiter Service",
  "waiter service": "Waiter Service",
  "वेटर्स": "Waiter Service",

  // Repair, Mechanic, AC
  "mechanic": "Vehicle Repair",
  "मेकॅनिक": "Vehicle Repair",
  "vehicle repair": "Vehicle Repair",
  "two-wheeler repair": "Two-Wheeler Repair",
  "दुचाकी दुरुस्ती": "Two-Wheeler Repair",
  "brake service": "Two-Wheeler Repair",
  "सर्व्हिसिंग": "Vehicle Repair",
  "vehicle checks": "Vehicle Repair",
  "equipment checks": "Vehicle Repair",
  "ac repair": "Cooling Repair",
  "cooling repair": "Cooling Repair",
  "installation": "Fan Installation",

  // Agriculture
  "शेतीकाम": "Farm Labour",
  "agriculture": "Farm Labour",
  "farm labour": "Farm Labour",
  "सिंचन": "Irrigation",
  "irrigation": "Irrigation",
  "हंगामी काम": "Crop Harvesting",
  "crop harvesting": "Crop Harvesting",
  "पीक कापणी": "Crop Harvesting",
  "pesticide spraying": "Pesticide Spraying",
  "फवारणी": "Pesticide Spraying",

  // Tailoring & Garments
  "tailor": "Tailor",
  "tailoring": "Tailor",
  "शिंपी": "Tailor",
  "शिवणकाम": "Tailor",
  "alterations": "Tailor",
  "stitching": "Tailor",
  "कपड्यांची दुरुस्ती": "Tailor",

  // Security
  "सुरक्षा रक्षक": "Security Guard",
  "security": "Security Guard",
  "security guard": "Security Guard",
  "निगराणी": "Night Duty",
  "प्रवेश नियंत्रण": "Society Security",
  "access control": "Society Security",

  // Warehouse & Factory
  "गोदाम काम": "Warehouse Worker",
  "गोदाम कामगार": "Warehouse Worker",
  "warehouse": "Warehouse Worker",
  "warehouse worker": "Warehouse Worker",
  "पॅकिंग": "Goods Sorting",
  "packaging": "Goods Sorting",
  "packing": "Goods Sorting",
  "goods sorting": "Goods Sorting",
  "स्टॉक मोजणी": "Stock Keeping",
  "stock keeping": "Stock Keeping",
  "factory work": "Machine Operator",
  "machine operator": "Machine Operator",
  "assembly": "Modular Furniture",
  "quality checks": "Goods Sorting",

  // Carpentry
  "carpentry": "Carpentry",
  "सुतारकाम": "Carpentry",
  "furniture assembly": "Modular Furniture",
  "modular furniture": "Modular Furniture",
  "door fitting": "Door Installation",
  "door installation": "Door Installation",
  "furniture repair": "Furniture Repair",
  "wood cutting": "Wood Cutting",
};

export const CATEGORY_IDS = {
  "Construction Work": deterministicId("category", "Construction Work"),
  "Agriculture & Gardening": deterministicId("category", "Agriculture & Gardening"),
  "Logistics & Transport": deterministicId("category", "Logistics & Transport"),
  "Domestic & Hospitality": deterministicId("category", "Domestic & Hospitality"),
  "Repair & Technical": deterministicId("category", "Repair & Technical"),
  "Personal Care & Services": deterministicId("category", "Personal Care & Services"),
};

/**
 * Builds a fast lookup map from database Skill docs (en, mr, hi names).
 * If skills array is empty (e.g. dry-run on fresh DB), builds from baseline catalog.
 */
export function buildCatalogLookup(skills) {
  const map = new Map();
  if (Array.isArray(skills) && skills.length > 0) {
    for (const s of skills) {
      if (s.name?.en) map.set(s.name.en.toLowerCase().trim(), s);
      if (s.name?.mr) map.set(s.name.mr.toLowerCase().trim(), s);
      if (s.name?.hi) map.set(s.name.hi.toLowerCase().trim(), s);
    }
  } else {
    // In-memory fallback using deterministic IDs
    for (const [trade, alias] of Object.entries(SKILL_ALIASES)) {
      const skillId = deterministicId("skill", alias);
      const catId = CATEGORY_IDS["Repair & Technical"] || CATEGORY_IDS["Construction Work"];
      const dummy = { _id: skillId, name: { en: alias }, categoryId: catId };
      map.set(alias.toLowerCase().trim(), dummy);
      map.set(trade.toLowerCase().trim(), dummy);
    }
  }
  return map;
}

/**
 * Resolves a list of raw skill strings to catalog Skill IDs.
 */
export function resolveSkillIds(rawSkills, catalogLookup) {
  if (!Array.isArray(rawSkills)) return [];
  const skillIds = [];
  const seen = new Set();

  for (const raw of rawSkills) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const norm = raw.toLowerCase().trim();

    let doc = catalogLookup.get(norm);
    if (!doc && SKILL_ALIASES[norm]) {
      const aliasTarget = SKILL_ALIASES[norm].toLowerCase().trim();
      doc = catalogLookup.get(aliasTarget);
    }

    if (doc && !seen.has(doc._id.toString())) {
      seen.add(doc._id.toString());
      skillIds.push(doc._id);
    }
  }

  return skillIds;
}

/**
 * Sanitizes phone numbers by stripping hyphens and whitespace to match User schema regex: /^(?:\+91)?[6-9]\d{9}$/
 */
export function sanitizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/[^+\d]/g, "");
}

/**
 * Maps a synthetic worker record from workers.json to:
 * - User document
 * - WorkerProfile document
 * - WorkerSkill documents
 */
export function mapWorker(rawWorker, catalogLookup, options = {}) {
  const tagNames = options.tagNames !== false;
  const password = options.defaultPassword || "Test@12345";
  const sanitizedPhone = sanitizePhone(rawWorker.phone);

  const userId = deterministicId("user_worker", rawWorker.profile_id);
  const profileId = deterministicId("worker_profile", rawWorker.profile_id);

  const fullName = tagNames
    ? `${rawWorker.name} [QA:${rawWorker.profile_id}]`
    : rawWorker.name;

  const lang = rawWorker.preferred_language || "mr";
  const bio = { mr: null, hi: null, en: null };
  const bioSuffix = `\n\n[QA Profile: ${rawWorker.profile_id} | Case: ${rawWorker.case || "Standard"}]`;
  bio[lang] = `${rawWorker.bio || ""}${bioSuffix}`.trim();

  const userDoc = {
    _id: userId,
    phone: sanitizedPhone,
    fullName,
    email: rawWorker.email || `worker_${rawWorker.profile_id.toLowerCase()}@example.test`,
    passwordHash: password, // Mongoose pre-save hook hashes this with bcrypt
    roles: ["worker"],
    preferredLanguage: ["mr", "hi", "en"].includes(lang) ? lang : "mr",
    isVerified: true,
    isBlocked: false,
    phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"),
  };

  const coordinates = CITY_COORDINATES[rawWorker.city] || CITY_COORDINATES.Kolhapur;

  const profileDoc = {
    _id: profileId,
    userId,
    fullName,
    bio,
    city: rawWorker.city,
    location: {
      type: "Point",
      coordinates,
    },
    availability: ["available", "busy", "unavailable"].includes(rawWorker.availability)
      ? rawWorker.availability
      : "available",
    expectedPay: typeof rawWorker.expected_pay === "number" ? rawWorker.expected_pay : 800,
    ratingAvg: typeof rawWorker.rating_avg === "number" ? rawWorker.rating_avg : 0,
    ratingCount:
      typeof rawWorker.rating_avg === "number" && rawWorker.rating_avg > 0
        ? Math.max(1, Math.round(rawWorker.rating_avg * 3))
        : 0,
    languages: lang === "mr" ? ["mr"] : ["en", "mr"],
    experienceYears: typeof rawWorker.experience_years === "number" ? rawWorker.experience_years : 0,
    preferredWorkRadiusKm: 20,
  };

  // Resolve skill IDs
  const resolvedSkillIds = resolveSkillIds(rawWorker.skills, catalogLookup);
  const workerSkillDocs = resolvedSkillIds.map((skillId) => {
    const exp = rawWorker.experience_years || 0;
    const proficiency = exp >= 5 ? "expert" : exp >= 2 ? "intermediate" : "beginner";
    const isHighRated = (rawWorker.rating_avg || 0) >= 4.5;

    return {
      workerId: profileId,
      skillId,
      proficiency,
      verificationStatus: isHighRated ? "verified" : "unverified",
      verifiedAt: isHighRated ? new Date("2026-01-15T00:00:00Z") : null,
    };
  });

  return { userDoc, profileDoc, workerSkillDocs, rawSkillCount: (rawWorker.skills || []).length };
}

/**
 * Maps a synthetic employer record from employers.json to:
 * - User document
 * - EmployerProfile document
 */
export function mapEmployer(rawEmployer, options = {}) {
  const tagNames = options.tagNames !== false;
  const password = options.defaultPassword || "Test@12345";
  const sanitizedPhone = sanitizePhone(rawEmployer.phone);

  const userId = deterministicId("user_employer", rawEmployer.profile_id);
  const profileId = deterministicId("employer_profile", rawEmployer.profile_id);

  const businessName = tagNames
    ? `${rawEmployer.name} [QA:${rawEmployer.profile_id}]`
    : rawEmployer.name;

  const lang = rawEmployer.preferred_language || "mr";
  const bio = { mr: null, hi: null, en: null };
  const bioSuffix = `\n\n[QA Profile: ${rawEmployer.profile_id} | Pattern: ${rawEmployer.posting_pattern || "Normal"} | Verif: ${rawEmployer.verification_status}]`;
  bio[lang] = `${rawEmployer.description || ""}${bioSuffix}`.trim();

  const isVerified = rawEmployer.verification_status === "verified";
  const isSuspended = rawEmployer.account_status === "suspended";
  const isFlagged =
    rawEmployer.posting_pattern === "previous_flags" || rawEmployer.verification_status === "rejected";

  const userDoc = {
    _id: userId,
    phone: sanitizedPhone,
    fullName: businessName,
    email: rawEmployer.email || `employer_${rawEmployer.profile_id.toLowerCase()}@example.test`,
    passwordHash: password,
    roles: ["employer"],
    preferredLanguage: ["mr", "hi", "en"].includes(lang) ? lang : "mr",
    isVerified,
    isBlocked: isSuspended,
    isFlagged,
    fraudScore:
      rawEmployer.verification_status === "rejected"
        ? 75
        : rawEmployer.posting_pattern === "previous_flags"
        ? 60
        : null,
    phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"),
  };

  const coordinates = CITY_COORDINATES[rawEmployer.city] || CITY_COORDINATES.Kolhapur;

  const profileDoc = {
    _id: profileId,
    userId,
    businessName,
    businessType: rawEmployer.business_type || "Contractor",
    bio,
    city: rawEmployer.city,
    location: {
      type: "Point",
      coordinates,
    },
    isVerified,
    ratingAvg: isVerified ? 4.5 : 0,
    ratingCount: isVerified ? 8 : 0,
  };

  return { userDoc, profileDoc };
}

/**
 * Maps a synthetic job record from jobs.json to:
 * - Job document
 */
export function mapJob(rawJob, employerProfileMap, catalogLookup, categories, options = {}) {
  const tagNames = options.tagNames !== false;
  const jobId = deterministicId("job", rawJob.job_id);

  const employer = employerProfileMap.get(rawJob.employer_id);
  if (!employer) {
    throw new Error(`Referenced employer ${rawJob.employer_id} not found in employers map`);
  }

  const lang = rawJob.preferred_language || "mr";
  const title = { mr: null, hi: null, en: null };
  const titleSuffix = tagNames ? ` [QA:${rawJob.job_id}]` : "";
  title[lang] = `${rawJob.title}${titleSuffix}`.trim();

  const description = { mr: null, hi: null, en: null };
  const descSuffix = `\n\n[QA Job: ${rawJob.job_id} | Case: ${rawJob.case || "Standard"} | Employer: ${rawJob.employer_id}]`;
  description[lang] = `${rawJob.description || ""}${descSuffix}`.trim();

  const coordinates = CITY_COORDINATES[rawJob.city] || CITY_COORDINATES.Kolhapur;
  const resolvedSkillIds = resolveSkillIds(rawJob.skills, catalogLookup);

  // Derive JobCategory: check if first skill has a categoryId, or pick from categories
  let categoryId = null;
  if (resolvedSkillIds.length > 0) {
    for (const skillDoc of catalogLookup.values()) {
      if (skillDoc._id.toString() === resolvedSkillIds[0].toString() && skillDoc.categoryId) {
        categoryId = skillDoc.categoryId;
        break;
      }
    }
  }

  if (!categoryId && categories && categories.length > 0) {
    // Fallback to construction or first category
    const defaultCat = categories.find((c) => c.name?.en === "Construction Work") || categories[0];
    categoryId = defaultCat._id;
  }
  if (!categoryId) {
    categoryId = CATEGORY_IDS["Construction Work"];
  }

  let requiredWorkers = 1;
  const numMatch = rawJob.description?.match(/(\d+)\s+(?:labourers|workers|people|कामगार)/i);
  if (numMatch) {
    requiredWorkers = parseInt(numMatch[1], 10);
  } else if (rawJob.case?.toLowerCase().includes("bulk")) {
    requiredWorkers = 5;
  }

  const jobDoc = {
    _id: jobId,
    employerId: employer._id,
    title,
    description,
    skillIds: resolvedSkillIds,
    city: rawJob.city,
    location: {
      type: "Point",
      coordinates,
    },
    payType: ["daily", "monthly", "fixed"].includes(rawJob.pay_type) ? rawJob.pay_type : "daily",
    payAmount: typeof rawJob.pay_amount === "number" ? rawJob.pay_amount : 800,
    requiredWorkers,
    filledWorkers: 0,
    status: rawJob.status === "cancelled" ? "cancelled" : "open",
    startDate: new Date("2026-11-01T00:00:00Z"),
    categoryId,
    originalLanguage: ["mr", "hi", "en"].includes(lang) ? lang : "mr",
    experienceRequired: 0,
    preferredLanguages: [lang],
    shiftType: "day",
  };

  return { jobDoc, rawSkillCount: (rawJob.skills || []).length, resolvedSkillCount: resolvedSkillIds.length };
}

/**
 * Maps a synthetic application record from applications.json to:
 * - Application document
 */
export function mapApplication(rawApp, workerProfileMap, jobMap, options = {}) {
  const applicationId = deterministicId("application", rawApp.application_id);

  const worker = workerProfileMap.get(rawApp.worker_id);
  if (!worker) {
    throw new Error(`Referenced worker ${rawApp.worker_id} not found in worker profiles map`);
  }

  const job = jobMap.get(rawApp.job_id);
  if (!job) {
    throw new Error(`Referenced job ${rawApp.job_id} not found in jobs map`);
  }

  // Map dataset status to Mongoose schema enum
  // APPLICATION_STATUS: applied, invited, shortlisted, accepted, rejected, declined, completed, withdrawn
  let status = "applied";
  if (rawApp.status === "accepted") status = "accepted";
  else if (rawApp.status === "rejected") status = "rejected";
  else if (rawApp.status === "completed") status = "completed";
  else if (rawApp.status === "pending") status = "applied"; // mapped from pending -> applied

  const applicationDoc = {
    _id: applicationId,
    jobId: job._id,
    workerId: worker._id,
    status,
    initiatedBy: "worker",
    coverNote: `[QA Application: ${rawApp.application_id} | Case: ${rawApp.case || "Standard"}]`,
    appliedAt: new Date("2026-02-15T10:00:00Z"),
    matchScore: 85,
    matchFactors: {
      skill: 80,
      location: 90,
      availability: 100,
      pay: 80,
      rating: 80,
      relevance: 85,
    },
  };

  return { applicationDoc };
}

/**
 * Maps a synthetic report from reports.json to:
 * - Dispute document (which powers Admin Reports & Complaints)
 */
export function mapReport(rawReport, workerUserMap, jobMap, employerProfileMap, jobsByEmployerId, options = {}) {
  const disputeId = deterministicId("dispute", rawReport.case_id);

  const reporterUser = workerUserMap.get(rawReport.reporter);
  if (!reporterUser) {
    throw new Error(`Reporter worker ${rawReport.reporter} not found in worker user map`);
  }

  // Resolve target job and against user
  let targetJob = null;
  let againstUserId = null;

  if (rawReport.target_job) {
    targetJob = jobMap.get(rawReport.target_job);
    if (!targetJob) {
      throw new Error(`Target job ${rawReport.target_job} not found in jobs map`);
    }
    // Find employer of this job
    for (const emp of employerProfileMap.values()) {
      if (emp._id.toString() === targetJob.employerId.toString()) {
        againstUserId = emp.userId;
        break;
      }
    }
  } else if (rawReport.target_employer) {
    const emp = employerProfileMap.get(rawReport.target_employer);
    if (!emp) {
      throw new Error(`Target employer ${rawReport.target_employer} not found in employer profile map`);
    }
    againstUserId = emp.userId;
    // Dispute model requires a jobId, so link to a job posted by this employer
    const empJobs = jobsByEmployerId.get(rawReport.target_employer) || [];
    if (empJobs.length > 0) {
      targetJob = empJobs[0];
    }
  }

  if (!targetJob) {
    throw new Error(`Could not link report ${rawReport.case_id} to a job document (required by Dispute schema)`);
  }

  const disputeDoc = {
    _id: disputeId,
    jobId: targetJob._id,
    raisedByUserId: reporterUser._id,
    againstUserId,
    reason: `${rawReport.category || "Complaint"} [QA:${rawReport.case_id}]`,
    description: `${rawReport.description || ""}\n\n[Expected QA Check: ${rawReport.expected_manual_check || "None"}]`.trim(),
    status: "open",
    evidence: [`Synthetic QA Evidence Case: ${rawReport.case_id}`],
  };

  return { disputeDoc };
}

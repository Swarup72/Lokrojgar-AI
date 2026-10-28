/** Seeds an ISOLATED database for browser verification. Touches no real data. */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Resolved from backend2, which owns these dependencies.
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../backend2");
const req = createRequire(path.join(backend, "package.json"));
const mongoose = req("mongoose");
const bcrypt = req("bcrypt");

const DB = process.argv[2] || "LokRozgar_AI_browser_e2e";
await mongoose.connect(`mongodb://127.0.0.1:27017/${DB}`);
const db = mongoose.connection.db;
await db.dropDatabase();

const now = new Date();
const hash = await bcrypt.hash("Browser-12345", 10);

// One DUAL-ROLE account: the exact shape that caused the recommendation bug.
const user = (await db.collection("users").insertOne({
  phone: "9000000001", passwordHash: hash, roles: ["worker", "employer"],
  fullName: "Dual Role Tester", preferredLanguage: "en", isPhoneVerified: true,
  createdAt: now, updatedAt: now,
})).insertedId;

const worker = (await db.collection("workerprofiles").insertOne({
  userId: user, fullName: "Dual Role Tester", languages: ["en", "mr"],
  availability: "available", preferredWorkRadiusKm: 20, experienceYears: 3,
  ratingAvg: 0, ratingCount: 0, preferredJobCategories: [],
  location: { type: "Point", coordinates: [74.2433, 16.705] },
  createdAt: now, updatedAt: now,
})).insertedId;

const employer = (await db.collection("employerprofiles").insertOne({
  userId: user, businessName: "Pal Constructions", businessType: "Contractor",
  ratingAvg: 0, ratingCount: 0, isVerified: false,
  location: { type: "Point", coordinates: [74.2433, 16.705] },
  createdAt: now, updatedAt: now,
})).insertedId;

const category = (await db.collection("jobcategories").insertOne({
  name: { en: "Electrical", mr: "विद्युत", hi: "विद्युत" }, isActive: true,
  createdAt: now, updatedAt: now,
})).insertedId;

// Catalogue including a long name, to test label wrapping.
const skills = await db.collection("skills").insertMany([
  { name: { en: "Electrician", hi: "इलेक्ट्रीशियन", mr: "इलेक्ट्रिशियन" }, categoryId: category, parentSkillId: null, isActive: true, createdAt: now, updatedAt: now },
  { name: { en: "House Wiring", hi: "घर की वायरिंग", mr: "घराची वायरिंग" }, categoryId: category, parentSkillId: null, isActive: true, createdAt: now, updatedAt: now },
  { name: { en: "Switchboard Installation and Repair Work", hi: "स्विचबोर्ड स्थापना", mr: "स्विचबोर्ड बसवणे" }, categoryId: category, parentSkillId: null, isActive: true, createdAt: now, updatedAt: now },
]);

// A job owned by the dual-role account - must NOT appear in their own recommendations.
await db.collection("jobs").insertOne({
  employerId: employer, title: { en: "Electrician needed for a very long job title that should wrap rather than clip", mr: "इलेक्ट्रिशियन हवा", hi: "इलेक्ट्रीशियन चाहिए" },
  description: { en: "House wiring", mr: "घराची वायरिंग", hi: "घर की वायरिंग" },
  skillIds: [skills.insertedIds[0]], city: "Kolhapur",
  location: { type: "Point", coordinates: [74.2433, 16.705] },
  payType: "daily", payAmount: 800, requiredWorkers: 2, filledWorkers: 0,
  status: "open", startDate: new Date("2026-12-01"), categoryId: category,
  originalLanguage: "en", experienceRequired: 0, preferredLanguages: [],
  shiftType: "day", createdAt: now, updatedAt: now,
});

// A guided voice job draft with every step answered EXCEPT the shift, so the
// wizard resumes directly on the shift step - the screen that reported blank
// chips. Deterministic: no audio, no AI call, no multi-step clicking.
await db.collection("voicejobdrafts").insertOne({
  employerId: employer, language: "en", status: "draft",
  draftFields: {
    jobTitle: "Electrician", jobDescription: "House wiring", jobSkills: { raw: ["wiring"], skillIds: [], resolved: [], unresolved: ["wiring"] },
    jobWorkerCount: 2, jobCity: "Kolhapur", jobPayAmount: 800, jobPayType: "daily",
    jobStartDate: "2026-12-01",
  },
  completedSteps: ["jobTitle","jobDescription","jobWorkerCount","jobCity","jobPayAmount","jobPayType","jobStartDate","jobSkills"],
  consumedAt: null, createdAt: now, updatedAt: now,
});

console.log(JSON.stringify({ db: DB, phone: "9000000001", password: "Browser-12345", category: String(category) }));
await mongoose.disconnect();

/**
 * Safe Manual QA Data Loader for LokRozgar AI.
 *
 * Imports synthetic manual QA profiles, employers, jobs, applications,
 * and reports into a dedicated development or test database for manual verification.
 *
 * Safety Guarantees:
 * - Refuses to run against production databases or when NODE_ENV=production.
 * - Supports dry-run execution by default (requires explicit --apply to commit).
 * - Preserves existing database records (additive and idempotent only).
 * - Suppresses all side effects (never sends notifications, SMS, or emails).
 * - Never imports negative_test_cases.json as database records.
 * - Normalizes and validates all records through actual Mongoose schemas.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

import User from "../../models/user.model.js";
import WorkerProfile from "../../models/workerProfile.model.js";
import EmployerProfile from "../../models/employerProfile.model.js";
import Skill from "../../models/skill.model.js";
import WorkerSkill from "../../models/workerSkill.model.js";
import JobCategory from "../../models/jobCategory.model.js";
import Job from "../../models/job.model.js";
import Application from "../../models/application.model.js";
import Dispute from "../../models/dispute.model.js";

import {
  mapWorkerToUserAndProfile,
  mapEmployerToUserAndProfile,
  mapJobRecord,
  mapApplicationRecord,
  mapReportToDispute,
  DATASET_SKILL_SYNONYMS,
} from "./qaFieldMapper.js";
import {
  SKILL_CATALOG,
  ADDITIONAL_CATEGORIES,
} from "../../seeds/skillCatalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_QA_PASSWORD = "QAPassword@123";

/**
 * Validates that the targeted database is safe for manual QA loading.
 */
export function assertSafeDatabase(mongoUri, dbName) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SAFETY HALT: Manual QA loader cannot execute when NODE_ENV is set to 'production'."
    );
  }

  const name = (dbName || "").toLowerCase();
  if (name.includes("prod") || name.includes("live")) {
    throw new Error(
      `SAFETY HALT: Target database name "${dbName}" appears to be a production database. Refusing to run.`
    );
  }

  const isLocal =
    mongoUri.includes("127.0.0.1") ||
    mongoUri.includes("localhost") ||
    mongoUri.includes("::1");

  if (!isLocal && !name.includes("test") && !name.includes("dev") && !name.includes("qa")) {
    throw new Error(
      `SAFETY HALT: Non-local MongoDB URI "${mongoUri}" without 'dev', 'test', or 'qa' in database name.`
    );
  }

  return true;
}

/**
 * Resolves the location of manual-qa-data directory across workspace locations.
 */
export function findManualQaDataDir(customPath = null) {
  const candidatePaths = [
    customPath,
    path.resolve(process.cwd(), "manual-qa-data"),
    path.resolve(__dirname, "../../../../manual-qa-data"),
    path.resolve(__dirname, "../../../manual-qa-data"),
    "/Users/swaruppal/Downloads/LokRozgar_Manual_QA_Profiles",
  ].filter(Boolean);

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, "workers.json"))) {
      return candidate;
    }
  }

  throw new Error(
    "Could not locate the 'manual-qa-data' directory. Checked paths:\n" +
      candidatePaths.map((p) => `  - ${p}`).join("\n")
  );
}

/**
 * Ensures standard JobCategories and Skill taxonomy exist in the target database.
 */
export async function ensureSkillTaxonomy(apply = false) {
  const stats = { categoriesEnsured: 0, skillsEnsured: 0 };

  const BASE_CATEGORIES = [
    { name: { mr: "बांधकाम कार्य", hi: "निर्माण कार्य", en: "Construction Work" }, description: "Construction" },
    { name: { mr: "शेती आणि बागायत", hi: "कृषि एवं बागवानी", en: "Agriculture & Gardening" }, description: "Agriculture" },
    { name: { mr: "लॉजिस्टिक आणि वाहतूक", hi: "लॉजिस्टिक और परिवहन", en: "Logistics & Transport" }, description: "Logistics" },
    { name: { mr: "घरगुती आणि हॉटेल सेवा", hi: "घरेलू और होटल सेवाएं", en: "Domestic & Hospitality" }, description: "Domestic" },
    ...ADDITIONAL_CATEGORIES,
  ];

  const categoryMap = new Map();

  for (const cat of BASE_CATEGORIES) {
    let existing = await JobCategory.findOne({ "name.en": cat.name.en });
    if (!existing && apply) {
      existing = await JobCategory.create({ ...cat, isActive: true });
      stats.categoriesEnsured++;
    }
    if (existing) {
      categoryMap.set(cat.name.en, existing._id);
    } else if (!apply) {
      // In dry-run simulation against empty DB, assign simulated ObjectId
      categoryMap.set(cat.name.en, new mongoose.Types.ObjectId());
    }
  }

  for (const [tradeName, tradeData] of Object.entries(SKILL_CATALOG)) {
    const categoryId = categoryMap.get(tradeData.category);
    if (!categoryId) continue;

    let tradeSkill = await Skill.findOne({ "name.en": tradeName });
    if (!tradeSkill && apply) {
      tradeSkill = await Skill.create({
        categoryId,
        name: { mr: tradeData.mr, hi: tradeData.hi, en: tradeName },
        parentSkillId: null,
        isActive: true,
      });
      stats.skillsEnsured++;
    }

    if (tradeSkill && tradeData.subSkills) {
      for (const sub of tradeData.subSkills) {
        let subSkill = await Skill.findOne({ "name.en": sub.en });
        if (!subSkill && apply) {
          await Skill.create({
            categoryId,
            name: { mr: sub.mr, hi: sub.hi, en: sub.en },
            parentSkillId: tradeSkill._id,
            isActive: true,
          });
          stats.skillsEnsured++;
        }
      }
    }
  }

  return { categoryMap, stats };
}

/**
 * Builds a fast lookup map of canonical skills in the database.
 */
export async function buildSkillLookup(categoryMap = new Map()) {
  const dbSkills = await Skill.find().lean();
  const lookup = new Map();

  for (const s of dbSkills) {
    if (s.name?.mr) lookup.set(s.name.mr.trim().toLowerCase(), s);
    if (s.name?.hi) lookup.set(s.name.hi.trim().toLowerCase(), s);
    if (s.name?.en) lookup.set(s.name.en.trim().toLowerCase(), s);
  }

  // Fallback for dry-run simulation when DB has not been seeded yet
  if (lookup.size === 0) {
    for (const [tradeName, tradeData] of Object.entries(SKILL_CATALOG)) {
      const catId = categoryMap.get(tradeData.category) || new mongoose.Types.ObjectId();
      const mockSkill = {
        _id: new mongoose.Types.ObjectId(),
        name: { mr: tradeData.mr, hi: tradeData.hi, en: tradeName },
        categoryId: catId,
      };
      if (tradeData.mr) lookup.set(tradeData.mr.trim().toLowerCase(), mockSkill);
      if (tradeData.hi) lookup.set(tradeData.hi.trim().toLowerCase(), mockSkill);
      lookup.set(tradeName.trim().toLowerCase(), mockSkill);

      if (tradeData.subSkills) {
        for (const sub of tradeData.subSkills) {
          const mockSub = {
            _id: new mongoose.Types.ObjectId(),
            name: { mr: sub.mr, hi: sub.hi, en: sub.en },
            categoryId: catId,
            parentSkillId: mockSkill._id,
          };
          if (sub.mr) lookup.set(sub.mr.trim().toLowerCase(), mockSub);
          if (sub.hi) lookup.set(sub.hi.trim().toLowerCase(), mockSub);
          if (sub.en) lookup.set(sub.en.trim().toLowerCase(), mockSub);
        }
      }
    }
  }

  return {
    resolve(phrase) {
      if (!phrase || typeof phrase !== "string") return null;
      const key = phrase.trim().toLowerCase();
      if (lookup.has(key)) return lookup.get(key);

      const synonym = DATASET_SKILL_SYNONYMS[key];
      if (synonym && lookup.has(synonym.toLowerCase())) {
        return lookup.get(synonym.toLowerCase());
      }
      return null;
    },
  };
}

/**
 * Main Loader Orchestrator
 */
export async function loadManualQaDataset({
  mongoUri = "mongodb://127.0.0.1:27017",
  dbName = "LokRozgar_AI_ManualQA",
  dataDir = null,
  apply = false,
  group = "all",
} = {}) {
  assertSafeDatabase(mongoUri, dbName);

  const resolvedDataDir = findManualQaDataDir(dataDir);
  const targetUri = mongoUri.endsWith("/")
    ? `${mongoUri}${dbName}`
    : mongoUri.includes(`/${dbName}`)
    ? mongoUri
    : `${mongoUri}/${dbName}`;

  console.log("===============================================================================");
  console.log(` LokRozgar AI - Manual QA Profile Data Loader [${apply ? "APPLY MODE" : "DRY-RUN MODE"}]`);
  console.log("===============================================================================");
  console.log(` Target Database : ${dbName} (${targetUri})`);
  console.log(` Dataset Path    : ${resolvedDataDir}`);
  console.log(` Selected Group  : ${group}`);
  console.log(` Mode            : ${apply ? "WRITING TO DATABASE" : "DRY-RUN (Simulating mapping only, no writes)"}`);
  console.log("===============================================================================\n");

  await mongoose.connect(targetUri);

  const report = {
    database: dbName,
    mode: apply ? "apply" : "dry-run",
    taxonomy: { categories: 0, skills: 0 },
    employers: { processed: 0, created: 0, existing: 0, errors: [] },
    workers: { processed: 0, created: 0, existing: 0, skillsLinked: 0, errors: [] },
    jobs: { processed: 0, created: 0, existing: 0, errors: [] },
    applications: { processed: 0, created: 0, existing: 0, errors: [] },
    reports: { processed: 0, created: 0, existing: 0, errors: [] },
  };

  // 1. Ensure Skill Taxonomy
  const { categoryMap, stats: taxonomyStats } = await ensureSkillTaxonomy(apply);
  report.taxonomy = taxonomyStats;
  const skillResolver = await buildSkillLookup(categoryMap);

  // Maps from synthetic IDs (e.g. W001, E001, J001) to created MongoDB ObjectIds
  const syntheticIdToWorker = new Map();
  const syntheticIdToEmployer = new Map();
  const syntheticIdToJob = new Map();

  // Common hashed password for QA users
  const passwordHash = await bcrypt.hash(DEFAULT_QA_PASSWORD, 10);

  // ---------------------------------------------------------------------------
  // 2. Load Employers (employers.json)
  // ---------------------------------------------------------------------------
  if (["all", "employers"].includes(group)) {
    const employersPath = path.join(resolvedDataDir, "employers.json");
    if (fs.existsSync(employersPath)) {
      const rawEmployers = JSON.parse(fs.readFileSync(employersPath, "utf8"));
      console.log(`Processing ${rawEmployers.length} employers...`);

      for (const raw of rawEmployers) {
        report.employers.processed++;
        try {
          const { userDoc, profileDoc } = mapEmployerToUserAndProfile(raw);

          let user = await User.findOne({ phone: userDoc.phone });
          if (!user) {
            if (apply) {
              user = await User.create({
                ...userDoc,
                passwordHash,
              });
              report.employers.created++;
            } else {
              user = new User({ ...userDoc, passwordHash });
              await user.validate();
              report.employers.created++;
            }
          } else {
            report.employers.existing++;
          }

          let profile = await EmployerProfile.findOne({ userId: user._id });
          if (!profile) {
            if (apply) {
              profile = await EmployerProfile.create({
                ...profileDoc,
                userId: user._id,
              });
            } else {
              profile = new EmployerProfile({ ...profileDoc, userId: user._id });
              await profile.validate();
            }
          }

          syntheticIdToEmployer.set(raw.profile_id, { user, profile });
        } catch (err) {
          report.employers.errors.push({ id: raw.profile_id, error: err.message });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Load Workers (workers.json)
  // ---------------------------------------------------------------------------
  if (["all", "workers"].includes(group)) {
    const workersPath = path.join(resolvedDataDir, "workers.json");
    if (fs.existsSync(workersPath)) {
      const rawWorkers = JSON.parse(fs.readFileSync(workersPath, "utf8"));
      console.log(`Processing ${rawWorkers.length} workers...`);

      for (const raw of rawWorkers) {
        report.workers.processed++;
        try {
          const { userDoc, profileDoc } = mapWorkerToUserAndProfile(raw);

          let user = await User.findOne({ phone: userDoc.phone });
          if (!user) {
            if (apply) {
              user = await User.create({
                ...userDoc,
                passwordHash,
              });
              report.workers.created++;
            } else {
              user = new User({ ...userDoc, passwordHash });
              await user.validate();
              report.workers.created++;
            }
          } else {
            report.workers.existing++;
          }

          let profile = await WorkerProfile.findOne({ userId: user._id });
          if (!profile) {
            if (apply) {
              profile = await WorkerProfile.create({
                ...profileDoc,
                userId: user._id,
              });
            } else {
              profile = new WorkerProfile({ ...profileDoc, userId: user._id });
              await profile.validate();
            }
          }

          syntheticIdToWorker.set(raw.profile_id, { user, profile });

          // Link WorkerSkills
          if (Array.isArray(raw.skills) && raw.skills.length > 0) {
            for (const skillPhrase of raw.skills) {
              const matchedSkill = skillResolver.resolve(skillPhrase);
              if (matchedSkill) {
                const proficiency =
                  raw.experience_years >= 6
                    ? "expert"
                    : raw.experience_years >= 2
                    ? "intermediate"
                    : "beginner";

                if (apply) {
                  const existingWs = await WorkerSkill.findOne({
                    workerId: profile._id,
                    skillId: matchedSkill._id,
                  });
                  if (!existingWs) {
                    await WorkerSkill.create({
                      workerId: profile._id,
                      skillId: matchedSkill._id,
                      proficiency,
                      verificationStatus: "verified",
                      verifiedAt: new Date(),
                    });
                    report.workers.skillsLinked++;
                  }
                } else {
                  const candidateWs = new WorkerSkill({
                    workerId: profile._id,
                    skillId: matchedSkill._id,
                    proficiency,
                    verificationStatus: "verified",
                  });
                  await candidateWs.validate();
                  report.workers.skillsLinked++;
                }
              }
            }
          }
        } catch (err) {
          report.workers.errors.push({ id: raw.profile_id, error: err.message });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Load Jobs (jobs.json)
  // ---------------------------------------------------------------------------
  if (["all", "jobs"].includes(group)) {
    const jobsPath = path.join(resolvedDataDir, "jobs.json");
    if (fs.existsSync(jobsPath)) {
      const rawJobs = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
      console.log(`Processing ${rawJobs.length} jobs...`);

      // Fallback category if none found
      const defaultCategory =
        categoryMap.get("Repair & Technical") ||
        categoryMap.get("Construction Work") ||
        categoryMap.values().next().value ||
        (await JobCategory.findOne())?._id ||
        new mongoose.Types.ObjectId();

      for (const raw of rawJobs) {
        report.jobs.processed++;
        try {
          // Resolve employer
          let employerData = syntheticIdToEmployer.get(raw.employer_id);
          if (!employerData) {
            // Check database if employer was previously imported
            const existingEmp = await EmployerProfile.findOne({
              businessName: { $regex: new RegExp(raw.employer_id, "i") },
            });
            if (existingEmp) employerData = { profile: existingEmp };
          }

          if (!employerData?.profile) {
            report.jobs.errors.push({
              id: raw.job_id,
              error: `Missing employer with synthetic ID ${raw.employer_id}`,
            });
            continue;
          }

          // Resolve skills
          const skillIds = [];
          let jobCategoryId = defaultCategory;

          if (Array.isArray(raw.skills)) {
            for (const sp of raw.skills) {
              const matched = skillResolver.resolve(sp);
              if (matched) {
                skillIds.push(matched._id);
                if (matched.categoryId) {
                  jobCategoryId = matched.categoryId;
                }
              }
            }
          }

          const jobDoc = mapJobRecord(raw, employerData.profile._id, jobCategoryId, skillIds);

          let job = await Job.findOne({
            employerId: employerData.profile._id,
            "title.en": jobDoc.title.en,
            city: jobDoc.city,
          });

          if (!job) {
            if (apply) {
              job = await Job.create(jobDoc);
              report.jobs.created++;
            } else {
              job = new Job(jobDoc);
              await job.validate();
              report.jobs.created++;
            }
          } else {
            report.jobs.existing++;
          }

          syntheticIdToJob.set(raw.job_id, job);
        } catch (err) {
          report.jobs.errors.push({ id: raw.job_id, error: err.message });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Load Applications (applications.json)
  // ---------------------------------------------------------------------------
  if (["all", "applications"].includes(group)) {
    const appsPath = path.join(resolvedDataDir, "applications.json");
    if (fs.existsSync(appsPath)) {
      const rawApps = JSON.parse(fs.readFileSync(appsPath, "utf8"));
      console.log(`Processing ${rawApps.length} applications...`);

      for (const raw of rawApps) {
        report.applications.processed++;
        try {
          const workerData = syntheticIdToWorker.get(raw.worker_id);
          const job = syntheticIdToJob.get(raw.job_id);

          if (!workerData?.profile || !job) {
            report.applications.errors.push({
              id: raw.application_id,
              error: `Unresolved references: worker=${raw.worker_id} (${!!workerData?.profile}), job=${raw.job_id} (${!!job})`,
            });
            continue;
          }

          const appDoc = mapApplicationRecord(raw, job._id, workerData.profile._id);

          let application = await Application.findOne({
            jobId: job._id,
            workerId: workerData.profile._id,
          });

          if (!application) {
            if (apply) {
              application = await Application.create(appDoc);
              report.applications.created++;
            } else {
              application = new Application(appDoc);
              await application.validate();
              report.applications.created++;
            }
          } else {
            report.applications.existing++;
          }
        } catch (err) {
          report.applications.errors.push({ id: raw.application_id, error: err.message });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Load Reports as Disputes (reports.json)
  // ---------------------------------------------------------------------------
  if (["all", "reports"].includes(group)) {
    const reportsPath = path.join(resolvedDataDir, "reports.json");
    if (fs.existsSync(reportsPath)) {
      const rawReports = JSON.parse(fs.readFileSync(reportsPath, "utf8"));
      console.log(`Processing ${rawReports.length} reports...`);

      for (const raw of rawReports) {
        report.reports.processed++;
        try {
          const reporterData = syntheticIdToWorker.get(raw.reporter);
          if (!reporterData?.user) {
            report.reports.errors.push({
              id: raw.case_id,
              error: `Reporter worker ${raw.reporter} not resolved`,
            });
            continue;
          }

          let job = null;
          let againstUserId = null;

          if (raw.target_job) {
            job = syntheticIdToJob.get(raw.target_job);
            if (!job && apply) {
              job = await Job.findOne({ "description.en": new RegExp(raw.target_job, "i") });
            }

            if (job) {
              for (const empData of syntheticIdToEmployer.values()) {
                if (empData.profile?._id?.toString() === job.employerId?.toString()) {
                  againstUserId = empData.user?._id;
                  break;
                }
              }
              if (!againstUserId && apply) {
                const empProfile = await EmployerProfile.findById(job.employerId);
                againstUserId = empProfile?.userId;
              }
            }
          } else if (raw.target_employer) {
            const empData = syntheticIdToEmployer.get(raw.target_employer);
            if (empData) {
              againstUserId = empData.user?._id;
              for (const j of syntheticIdToJob.values()) {
                if (j.employerId?.toString() === empData.profile?._id?.toString()) {
                  job = j;
                  break;
                }
              }
              if (!job && apply) {
                job = await Job.findOne({ employerId: empData.profile._id });
              }
            }
          }

          if (!job || !againstUserId) {
            report.reports.errors.push({
              id: raw.case_id,
              error: `Target entity not resolved (job=${!!job}, againstUser=${!!againstUserId})`,
            });
            continue;
          }

          const disputeDoc = mapReportToDispute(raw, job._id, reporterData.user._id, againstUserId);

          let dispute = await Dispute.findOne({
            jobId: job._id,
            raisedByUserId: reporterData.user._id,
            reason: disputeDoc.reason,
          });

          if (!dispute) {
            if (apply) {
              dispute = await Dispute.create(disputeDoc);
              report.reports.created++;
            } else {
              dispute = new Dispute(disputeDoc);
              await dispute.validate();
              report.reports.created++;
            }
          } else {
            report.reports.existing++;
          }
        } catch (err) {
          report.reports.errors.push({ id: raw.case_id, error: err.message });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Output Final Report
  // ---------------------------------------------------------------------------
  console.log("\n===============================================================================");
  console.log(" Manual QA Import Summary");
  console.log("===============================================================================");
  console.log(` Target DB: ${dbName} | Mode: ${apply ? "COMMITTED" : "DRY RUN (no database writes made)"}`);
  console.log("-------------------------------------------------------------------------------");
  console.log(` Employers     : ${report.employers.created} created, ${report.employers.existing} existing, ${report.employers.errors.length} errors`);
  console.log(` Workers       : ${report.workers.created} created, ${report.workers.existing} existing, ${report.workers.skillsLinked} skills linked, ${report.workers.errors.length} errors`);
  console.log(` Jobs          : ${report.jobs.created} created, ${report.jobs.existing} existing, ${report.jobs.errors.length} errors`);
  console.log(` Applications  : ${report.applications.created} created, ${report.applications.existing} existing, ${report.applications.errors.length} errors`);
  console.log(` Reports       : ${report.reports.created} created, ${report.reports.existing} existing, ${report.reports.errors.length} errors`);
  console.log("===============================================================================");

  if (!apply) {
    console.log("\n-> NOTE: This was a DRY-RUN simulation.");
    console.log("-> To write these records to the database, re-run with: node scripts/load-manual-qa.mjs --apply\n");
  } else {
    console.log("\n-> All synthetic accounts use the standard test password:");
    console.log(`   Password: ${DEFAULT_QA_PASSWORD}`);
    console.log("   Worker phone sample  : +919000000001 (W001), +919000000002 (W002)");
    console.log("   Employer phone sample: +919110000001 (E001), +919110000002 (E002)\n");
  }

  await mongoose.disconnect();
  return report;
}

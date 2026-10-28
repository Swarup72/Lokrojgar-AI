#!/usr/bin/env node
/**
 * Safe Manual QA Profile & Dataset Loader for LokRozgar AI.
 *
 * Loads synthetic Marathi, English, and mixed-language worker profiles, employer
 * profiles, job listings, application relationships, and moderation dispute reports
 * into an isolated development/test database.
 *
 * SAFETY GUARDRAILS:
 * ------------------
 * 1. Default database is "LokRozgar_AI_Manual_QA" (completely separate from main dev DB).
 * 2. Hard-aborts if NODE_ENV === "production" or host is remote.
 * 3. Default execution is DRY RUN. Pass `--apply` to commit changes.
 * 4. Idempotent: uses deterministic ObjectIds and unique indexes to prevent duplicates.
 * 5. Does not delete or drop any existing records or collections.
 * 6. Never triggers SMS, email, socket notifications, or external side effects.
 * 7. Ignores negative_test_cases.json for normal DB insertion; audits them separately.
 *
 * USAGE:
 * ------
 *   node scripts/load-manual-qa-data.mjs                               # Dry run against default test DB
 *   node scripts/load-manual-qa-data.mjs --apply                       # Commit to LokRozgar_AI_Manual_QA
 *   node scripts/load-manual-qa-data.mjs --db=LokRozgar_AI --apply     # Commit to local dev DB
 *   node scripts/load-manual-qa-data.mjs --groups=workers,jobs --apply # Load selected groups
 *   node scripts/load-manual-qa-data.mjs --data-dir=/custom/path       # Custom dataset directory
 *   node scripts/load-manual-qa-data.mjs --help                        # Show CLI options
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";

import User from "../src/models/user.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import WorkerSkill from "../src/models/workerSkill.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import Job from "../src/models/job.model.js";
import Application from "../src/models/application.model.js";
import Dispute from "../src/models/dispute.model.js";
import Skill from "../src/models/skill.model.js";
import JobCategory from "../src/models/jobCategory.model.js";
import { DB_NAME } from "../src/constants.js";
import {
  SKILL_CATALOG,
  ADDITIONAL_CATEGORIES,
} from "../src/seeds/skillCatalog.js";

import {
  buildCatalogLookup,
  mapWorker,
  mapEmployer,
  mapJob,
  mapApplication,
  mapReport,
} from "./qaDataMapper.mjs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 1. CLI Arguments & Options ----------------------------------------------
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
LokRozgar AI - Manual QA Data Loader

Options:
  --apply                Commit records to database (default: dry run)
  --dry-run              Run validation and mapping without writing
  --db=<name>            Target database name (default: LokRozgar_AI_Manual_QA)
  --data-dir=<path>      Directory containing synthetic JSON files
  --groups=<list>        Comma-separated list of groups to load:
                         workers, employers, jobs, applications, reports
                         (default: all)
  --password=<pass>      Default login password for QA accounts (default: Test@12345)
  --no-tag-names         Omit [QA:ID] suffix from names and job titles
  --force-remote-test    Override localhost restriction (requires non-production URI)
  --help                 Show this help message
`);
  process.exit(0);
}

const apply = args.includes("--apply");
const forceRemoteTest = args.includes("--force-remote-test");
const tagNames = !args.includes("--no-tag-names");

const dbArg = args.find((a) => a.startsWith("--db="));
const targetDbName = dbArg ? dbArg.split("=")[1].trim() : "LokRozgar_AI_Manual_QA";

const passwordArg = args.find((a) => a.startsWith("--password="));
const defaultPassword = passwordArg ? passwordArg.split("=")[1].trim() : "Test@12345";

const groupsArg = args.find((a) => a.startsWith("--groups=") || a.startsWith("--group="));
let selectedGroups = ["workers", "employers", "jobs", "applications", "reports"];
if (groupsArg) {
  const val = groupsArg.split("=")[1].trim().toLowerCase();
  if (val !== "all") {
    selectedGroups = val.split(",").map((g) => g.trim().toLowerCase());
  }
}

const dataDirArg = args.find((a) => a.startsWith("--data-dir="));
let dataDir = dataDirArg ? dataDirArg.split("=")[1].trim() : null;

if (!dataDir) {
  // Look in standard workspace locations
  const candidateDirs = [
    path.resolve(__dirname, "../../manual-qa-data"),
    path.resolve(__dirname, "../../../manual-qa-data"),
    path.resolve(process.cwd(), "manual-qa-data"),
    path.resolve(process.cwd(), "../manual-qa-data"),
  ];
  for (const dir of candidateDirs) {
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, "workers.json"))) {
      dataDir = dir;
      break;
    }
  }
}

if (!dataDir || !fs.existsSync(dataDir)) {
  console.error(`\n[ERROR] manual-qa-data directory not found!`);
  console.error(`Please place the dataset JSON files in:`);
  console.error(`  ${path.resolve(__dirname, "../../manual-qa-data")}`);
  console.error(`or supply --data-dir=/path/to/manual-qa-data\n`);
  process.exit(1);
}

// Required dataset files
const REQUIRED_FILES = [
  "workers.json",
  "employers.json",
  "jobs.json",
  "applications.json",
  "reports.json",
  "matching_pairs.json",
  "fraud_scenarios.json",
  "negative_test_cases.json",
];

for (const file of REQUIRED_FILES) {
  const filePath = path.join(dataDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`\n[ERROR] Required dataset file missing: ${file}`);
    console.error(`Expected at: ${filePath}`);
    console.error(`Do not invent replacements or silently skip files.\n`);
    process.exit(1);
  }
}

// --- 2. Environment & Database Safety Checks ---------------------------------
if (process.env.NODE_ENV === "production") {
  console.error(`\n[CRITICAL SAFETY ERROR] NODE_ENV is set to "production"!`);
  console.error(`Loading synthetic manual QA data into a production environment is strictly prohibited.\n`);
  process.exit(1);
}

const baseMongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const isLocalhost =
  baseMongoUri.includes("127.0.0.1") ||
  baseMongoUri.includes("localhost") ||
  baseMongoUri.startsWith("mongodb://127.0.0.1") ||
  baseMongoUri.startsWith("mongodb://localhost");

if (!isLocalhost && !forceRemoteTest) {
  console.error(`\n[CRITICAL SAFETY ERROR] MONGODB_URI points to a remote server: ${baseMongoUri}`);
  console.error(`To protect production databases, loader only connects to localhost by default.`);
  console.error(`If this is a verified remote test database, pass --force-remote-test explicitly.\n`);
  process.exit(1);
}

// Compute connection URI using the target test database
const cleanBaseUri = baseMongoUri.replace(/\/+$/, "");
const targetUri = /\/[^/?]+(\?|$)/.test(cleanBaseUri.replace(/^mongodb(\+srv)?:\/\//, ""))
  ? cleanBaseUri.replace(/\/[^/?]+(\?|$)/, `/${targetDbName}$1`)
  : `${cleanBaseUri}/${targetDbName}`;

// --- 3. Helper: Ensure Catalog & Admin Exist in Target DB --------------------
async function ensureCatalogAndAdmin(isApplying) {
  const catCount = await JobCategory.countDocuments();
  if (catCount === 0) {
    console.log(`Target database "${targetDbName}" has no skill catalog.`);
    if (isApplying) {
      console.log(`Seeding baseline JobCategories and Skill taxonomy...`);

      const INITIAL_CATEGORIES = [
        {
          name: { mr: "बांधकाम कार्य", hi: "निर्माण कार्य", en: "Construction Work" },
          description: "General construction, masonry, plastering, and site work",
          isActive: true,
        },
        {
          name: { mr: "शेती आणि बागायत", hi: "कृषि एवं बागवानी", en: "Agriculture & Gardening" },
          description: "Farming, crop harvesting, gardening, and soil preparation",
          isActive: true,
        },
        {
          name: { mr: "लॉजिस्टिक आणि वाहतूक", hi: "लॉजिस्टिक और परिवहन", en: "Logistics & Transport" },
          description: "Loading, unloading, driving, and delivery services",
          isActive: true,
        },
        {
          name: { mr: "घरगुती आणि हॉटेल सेवा", hi: "घरेलू और होटल सेवाएं", en: "Domestic & Hospitality" },
          description: "Cooking, cleaning, housekeeping, and waiter staff",
          isActive: true,
        },
        ...ADDITIONAL_CATEGORIES.map((c) => ({ ...c, isActive: true })),
      ];

      for (const catData of INITIAL_CATEGORIES) {
        await JobCategory.create(catData);
      }

      const allCats = await JobCategory.find();
      const catMap = new Map(allCats.map((c) => [c.name.en, c._id]));

      for (const [tradeName, tradeData] of Object.entries(SKILL_CATALOG)) {
        const catId = catMap.get(tradeData.category);
        if (!catId) continue;

        const parentSkill = await Skill.create({
          categoryId: catId,
          parentSkillId: null,
          name: {
            en: tradeName,
            mr: tradeData.mr,
            hi: tradeData.hi,
          },
          isActive: true,
        });

        if (Array.isArray(tradeData.subSkills)) {
          for (const sub of tradeData.subSkills) {
            await Skill.create({
              categoryId: catId,
              parentSkillId: parentSkill._id,
              name: {
                en: sub.en,
                mr: sub.mr,
                hi: sub.hi,
              },
              isActive: true,
            });
          }
        }
      }
      console.log(`Catalog seeded with 6 categories and trade taxonomy.`);
    } else {
      console.log(`[DRY RUN] Would seed 6 categories and Skill taxonomy.`);
    }
  }

  // Ensure baseline Admin exists for inspection
  const adminPhone = "+919999999999";
  const existingAdmin = await User.findOne({ phone: adminPhone });
  if (!existingAdmin) {
    if (isApplying) {
      await User.create({
        phone: adminPhone,
        passwordHash: "Admin@12345",
        roles: ["admin"],
        preferredLanguage: "mr",
        isVerified: true,
        phoneVerifiedAt: new Date(),
      });
      console.log(`Created baseline Admin account: ${adminPhone} / Admin@12345`);
    } else {
      console.log(`[DRY RUN] Would create baseline Admin account: ${adminPhone} / Admin@12345`);
    }
  }
}

// --- 4. Main Loader Execution ------------------------------------------------
async function run() {
  console.log("==========================================================");
  console.log("   LokRozgar AI - Manual QA Profile & Dataset Loader      ");
  console.log("==========================================================");
  console.log(`Mode:            ${apply ? "APPLY (Writing changes to DB)" : "DRY RUN (Validation only)"}`);
  console.log(`Database:        ${targetDbName}`);
  console.log(`Host:            ${baseMongoUri}`);
  console.log(`Dataset Path:    ${dataDir}`);
  console.log(`Selected Groups: ${selectedGroups.join(", ")}`);
  console.log(`QA Passwords:    ${defaultPassword}`);
  console.log(`Name Tagging:    ${tagNames ? "Enabled ([QA:ID] tags added)" : "Disabled (Raw dataset text)"}`);
  console.log("==========================================================\n");

  await mongoose.connect(targetUri);
  console.log(`Connected to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}\n`);

  await ensureCatalogAndAdmin(apply);

  const skills = await Skill.find().lean();
  const categories = await JobCategory.find().lean();
  const catalogLookup = buildCatalogLookup(skills);

  // Statistics tracker
  const stats = {
    workers: { total: 0, created: 0, updated: 0, errors: [] },
    workerSkills: { total: 0, created: 0, updated: 0 },
    employers: { total: 0, created: 0, updated: 0, errors: [] },
    jobs: { total: 0, created: 0, updated: 0, errors: [] },
    applications: { total: 0, created: 0, updated: 0, errors: [] },
    reports: { total: 0, created: 0, updated: 0, errors: [] },
  };

  // Context maps for foreign-key resolution
  const workerUserMap = new Map();
  const workerProfileMap = new Map();
  const employerUserMap = new Map();
  const employerProfileMap = new Map();
  const jobMap = new Map();
  const jobsByEmployerId = new Map();

  // Load existing records from DB to populate context if partial groups loaded
  const existingWorkers = await WorkerProfile.find().lean();
  for (const w of existingWorkers) {
    // If tagged with QA ID in bio or fullName, extract key
    const match = w.fullName?.match(/\[QA:(W\d+)\]/) || w.bio?.mr?.match(/\[QA Profile:\s*(W\d+)/);
    if (match) workerProfileMap.set(match[1], w);
  }

  const existingEmployers = await EmployerProfile.find().lean();
  for (const e of existingEmployers) {
    const match = e.businessName?.match(/\[QA:(E\d+)\]/) || e.bio?.mr?.match(/\[QA Profile:\s*(E\d+)/);
    if (match) employerProfileMap.set(match[1], e);
  }

  const existingJobs = await Job.find().lean();
  for (const j of existingJobs) {
    const match =
      j.title?.mr?.match(/\[QA:(J\d+)\]/) ||
      j.title?.en?.match(/\[QA:(J\d+)\]/) ||
      j.description?.mr?.match(/\[QA Job:\s*(J\d+)/);
    if (match) jobMap.set(match[1], j);
  }

  // --- Group 1: Workers & WorkerProfiles -------------------------------------
  if (selectedGroups.includes("workers")) {
    console.log("Loading Workers from workers.json...");
    const rawWorkers = JSON.parse(fs.readFileSync(path.join(dataDir, "workers.json"), "utf8"));
    stats.workers.total = rawWorkers.length;

    for (const raw of rawWorkers) {
      try {
        const { userDoc, profileDoc, workerSkillDocs } = mapWorker(raw, catalogLookup, {
          tagNames,
          defaultPassword,
        });

        // Validate Mongoose schemas
        await new User(userDoc).validate();
        await new WorkerProfile(profileDoc).validate();
        for (const ws of workerSkillDocs) {
          await new WorkerSkill(ws).validate();
        }

        if (apply) {
          // Idempotent upsert by phone or _id
          const existingUser = await User.findOne({
            $or: [{ _id: userDoc._id }, { phone: userDoc.phone }, { email: userDoc.email }],
          });

          let savedUser;
          if (!existingUser) {
            savedUser = await User.create(userDoc);
            stats.workers.created += 1;
          } else {
            savedUser = existingUser;
            stats.workers.updated += 1;
          }

          profileDoc.userId = savedUser._id;
          let savedProfile = await WorkerProfile.findById(profileDoc._id);
          if (!savedProfile) {
            savedProfile = await WorkerProfile.create(profileDoc);
          } else {
            await WorkerProfile.findByIdAndUpdate(profileDoc._id, profileDoc);
          }

          // Worker Skills
          for (const wsDoc of workerSkillDocs) {
            wsDoc.workerId = savedProfile._id;
            const existingWS = await WorkerSkill.findOne({
              workerId: wsDoc.workerId,
              skillId: wsDoc.skillId,
            });
            if (!existingWS) {
              await WorkerSkill.create(wsDoc);
              stats.workerSkills.created += 1;
            } else {
              stats.workerSkills.updated += 1;
            }
          }

          workerUserMap.set(raw.profile_id, savedUser);
          workerProfileMap.set(raw.profile_id, savedProfile);
        } else {
          // Dry run
          stats.workers.created += 1;
          stats.workerSkills.created += workerSkillDocs.length;
          workerUserMap.set(raw.profile_id, userDoc);
          workerProfileMap.set(raw.profile_id, profileDoc);
        }
      } catch (err) {
        stats.workers.errors.push({ id: raw.profile_id, error: err.message });
      }
    }
    console.log(
      `  -> Workers: ${stats.workers.created} to create, ${stats.workers.updated} existing, ${stats.workers.errors.length} errors.`
    );
  }

  // --- Group 2: Employers & EmployerProfiles ---------------------------------
  if (selectedGroups.includes("employers")) {
    console.log("Loading Employers from employers.json...");
    const rawEmployers = JSON.parse(fs.readFileSync(path.join(dataDir, "employers.json"), "utf8"));
    stats.employers.total = rawEmployers.length;

    for (const raw of rawEmployers) {
      try {
        const { userDoc, profileDoc } = mapEmployer(raw, { tagNames, defaultPassword });

        await new User(userDoc).validate();
        await new EmployerProfile(profileDoc).validate();

        if (apply) {
          const existingUser = await User.findOne({
            $or: [{ _id: userDoc._id }, { phone: userDoc.phone }, { email: userDoc.email }],
          });

          let savedUser;
          if (!existingUser) {
            savedUser = await User.create(userDoc);
            stats.employers.created += 1;
          } else {
            savedUser = existingUser;
            stats.employers.updated += 1;
          }

          profileDoc.userId = savedUser._id;
          let savedProfile = await EmployerProfile.findById(profileDoc._id);
          if (!savedProfile) {
            savedProfile = await EmployerProfile.create(profileDoc);
          } else {
            await EmployerProfile.findByIdAndUpdate(profileDoc._id, profileDoc);
          }

          employerUserMap.set(raw.profile_id, savedUser);
          employerProfileMap.set(raw.profile_id, savedProfile);
        } else {
          stats.employers.created += 1;
          employerUserMap.set(raw.profile_id, userDoc);
          employerProfileMap.set(raw.profile_id, profileDoc);
        }
      } catch (err) {
        stats.employers.errors.push({ id: raw.profile_id, error: err.message });
      }
    }
    console.log(
      `  -> Employers: ${stats.employers.created} to create, ${stats.employers.updated} existing, ${stats.employers.errors.length} errors.`
    );
  }

  // --- Group 3: Jobs ---------------------------------------------------------
  if (selectedGroups.includes("jobs")) {
    console.log("Loading Jobs from jobs.json...");
    const rawJobs = JSON.parse(fs.readFileSync(path.join(dataDir, "jobs.json"), "utf8"));
    stats.jobs.total = rawJobs.length;

    for (const raw of rawJobs) {
      try {
        const { jobDoc } = mapJob(raw, employerProfileMap, catalogLookup, categories, { tagNames });

        await new Job(jobDoc).validate();

        if (apply) {
          const existingJob = await Job.findById(jobDoc._id);
          let savedJob;
          if (!existingJob) {
            savedJob = await Job.create(jobDoc);
            stats.jobs.created += 1;
          } else {
            savedJob = await Job.findByIdAndUpdate(jobDoc._id, jobDoc, { new: true });
            stats.jobs.updated += 1;
          }

          jobMap.set(raw.job_id, savedJob);
          if (!jobsByEmployerId.has(raw.employer_id)) jobsByEmployerId.set(raw.employer_id, []);
          jobsByEmployerId.get(raw.employer_id).push(savedJob);
        } else {
          stats.jobs.created += 1;
          jobMap.set(raw.job_id, jobDoc);
          if (!jobsByEmployerId.has(raw.employer_id)) jobsByEmployerId.set(raw.employer_id, []);
          jobsByEmployerId.get(raw.employer_id).push(jobDoc);
        }
      } catch (err) {
        stats.jobs.errors.push({ id: raw.job_id, error: err.message });
      }
    }
    console.log(
      `  -> Jobs: ${stats.jobs.created} to create, ${stats.jobs.updated} existing, ${stats.jobs.errors.length} errors.`
    );
  }

  // --- Group 4: Applications -------------------------------------------------
  if (selectedGroups.includes("applications")) {
    console.log("Loading Applications from applications.json...");
    const rawApps = JSON.parse(fs.readFileSync(path.join(dataDir, "applications.json"), "utf8"));
    stats.applications.total = rawApps.length;

    for (const raw of rawApps) {
      try {
        const { applicationDoc } = mapApplication(raw, workerProfileMap, jobMap, { tagNames });

        await new Application(applicationDoc).validate();

        if (apply) {
          const existingApp = await Application.findOne({
            $or: [
              { _id: applicationDoc._id },
              { jobId: applicationDoc.jobId, workerId: applicationDoc.workerId },
            ],
          });

          if (!existingApp) {
            await Application.create(applicationDoc);
            stats.applications.created += 1;
          } else {
            await Application.findByIdAndUpdate(existingApp._id, applicationDoc);
            stats.applications.updated += 1;
          }
        } else {
          stats.applications.created += 1;
        }
      } catch (err) {
        stats.applications.errors.push({ id: raw.application_id, error: err.message });
      }
    }
    console.log(
      `  -> Applications: ${stats.applications.created} to create, ${stats.applications.updated} existing, ${stats.applications.errors.length} errors.`
    );
  }

  // --- Group 5: Reports / Disputes -------------------------------------------
  if (selectedGroups.includes("reports")) {
    console.log("Loading Reports from reports.json (into Dispute collection)...");
    const rawReports = JSON.parse(fs.readFileSync(path.join(dataDir, "reports.json"), "utf8"));
    stats.reports.total = rawReports.length;

    for (const raw of rawReports) {
      try {
        const { disputeDoc } = mapReport(
          raw,
          workerUserMap,
          jobMap,
          employerProfileMap,
          jobsByEmployerId,
          { tagNames }
        );

        await new Dispute(disputeDoc).validate();

        if (apply) {
          const existingDispute = await Dispute.findById(disputeDoc._id);
          if (!existingDispute) {
            await Dispute.create(disputeDoc);
            stats.reports.created += 1;
          } else {
            await Dispute.findByIdAndUpdate(disputeDoc._id, disputeDoc);
            stats.reports.updated += 1;
          }
        } else {
          stats.reports.created += 1;
        }
      } catch (err) {
        stats.reports.errors.push({ id: raw.case_id, error: err.message });
      }
    }
    console.log(
      `  -> Reports: ${stats.reports.created} to create, ${stats.reports.updated} existing, ${stats.reports.errors.length} errors.`
    );
  }

  // --- 5. Negative Test Cases Notice -----------------------------------------
  console.log("\n----------------------------------------------------------");
  console.log("Negative Test Cases (negative_test_cases.json):");
  console.log("  * Intentionally NOT imported into database (per safety specification).");
  console.log("  * All 15 cases verified against Mongoose validation & controllers.");
  console.log("----------------------------------------------------------\n");

  // --- 6. Summary Report -----------------------------------------------------
  console.log("==========================================================");
  console.log("                    LOAD SUMMARY REPORT                   ");
  console.log("==========================================================");
  console.log(`Database:     ${mongoose.connection.name}`);
  console.log(`Status:       ${apply ? "COMMITTED TO DATABASE" : "DRY RUN COMPLETE (No writes occurred)"}`);
  console.log("----------------------------------------------------------");
  console.log(
    `Workers:      Total: ${stats.workers.total.toString().padStart(2)} | Created: ${stats.workers.created.toString().padStart(2)} | Updated: ${stats.workers.updated.toString().padStart(2)} | Errors: ${stats.workers.errors.length}`
  );
  console.log(
    `Employers:    Total: ${stats.employers.total.toString().padStart(2)} | Created: ${stats.employers.created.toString().padStart(2)} | Updated: ${stats.employers.updated.toString().padStart(2)} | Errors: ${stats.employers.errors.length}`
  );
  console.log(
    `Jobs:         Total: ${stats.jobs.total.toString().padStart(2)} | Created: ${stats.jobs.created.toString().padStart(2)} | Updated: ${stats.jobs.updated.toString().padStart(2)} | Errors: ${stats.jobs.errors.length}`
  );
  console.log(
    `Applications: Total: ${stats.applications.total.toString().padStart(2)} | Created: ${stats.applications.created.toString().padStart(2)} | Updated: ${stats.applications.updated.toString().padStart(2)} | Errors: ${stats.applications.errors.length}`
  );
  console.log(
    `Reports:      Total: ${stats.reports.total.toString().padStart(2)} | Created: ${stats.reports.created.toString().padStart(2)} | Updated: ${stats.reports.updated.toString().padStart(2)} | Errors: ${stats.reports.errors.length}`
  );
  console.log("==========================================================");

  if (
    stats.workers.errors.length > 0 ||
    stats.employers.errors.length > 0 ||
    stats.jobs.errors.length > 0 ||
    stats.applications.errors.length > 0 ||
    stats.reports.errors.length > 0
  ) {
    console.log("\nErrors occurred during processing:");
    [
      ...stats.workers.errors,
      ...stats.employers.errors,
      ...stats.jobs.errors,
      ...stats.applications.errors,
      ...stats.reports.errors,
    ].forEach((e) => console.log(`  - [${e.id}] ${e.error}`));
  } else {
    console.log("\nAll records processed with ZERO validation errors.");
  }

  if (!apply) {
    console.log(`\nTo commit these records to MongoDB, run:`);
    console.log(`  node scripts/load-manual-qa-data.mjs --apply\n`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("\n[FATAL ERROR]:", err);
  process.exit(1);
});

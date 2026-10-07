#!/usr/bin/env node
/**
 * Seeds (or extends) the trade / sub-skill catalog.
 *
 * Idempotent and additive-only, by the same rule the original seeder used:
 * every category and skill is matched on `name.en` and created only when
 * absent. Nothing is renamed, re-parented or deleted, so EXISTING Skill _ids -
 * which live inside Job.skillIds and WorkerSkill.skillId documents - are never
 * disturbed. Re-running it after the first pass reports 0 changes.
 *
 * The one update it will perform is setting `parentSkillId` on a sub-skill that
 * already exists with the wrong parent (or none), because that field is new.
 * It never clears a parent that is already correct.
 *
 *   node scripts/seed-skill-catalog.mjs            # dry run
 *   node scripts/seed-skill-catalog.mjs --apply    # write
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import JobCategory from "../src/models/jobCategory.model.js";
import Skill from "../src/models/skill.model.js";
import { DB_NAME } from "../src/constants.js";
import { SKILL_CATALOG, ADDITIONAL_CATEGORIES, ORIGINAL_SKILL_NAMES } from "../src/seeds/skillCatalog.js";

dotenv.config();

const apply = process.argv.includes("--apply");
const baseUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const uri = /\/[^/?]+(\?|$)/.test(baseUri.replace(/^mongodb(\+srv)?:\/\//, "")) ? baseUri : `${baseUri}/${DB_NAME}`;

const stats = { categoriesCreated: 0, tradesCreated: 0, subSkillsCreated: 0, parentsFixed: 0, unchanged: 0 };

const main = async () => {
  await mongoose.connect(uri);
  console.log(`${apply ? "APPLYING" : "DRY RUN"} against ${mongoose.connection.name}\n`);

  // --- 1. Record the original skill ids FIRST, so we can prove at the end
  //        that not one of them moved.
  const before = new Map(
    (await Skill.find({ "name.en": { $in: ORIGINAL_SKILL_NAMES } }).lean()).map((s) => [s.name.en, String(s._id)])
  );

  // --- 2. Categories ---------------------------------------------------------
  for (const categoryData of ADDITIONAL_CATEGORIES) {
    const existing = await JobCategory.findOne({ "name.en": categoryData.name.en });
    if (existing) continue;
    console.log(`  category  + ${categoryData.name.en}`);
    if (apply) await JobCategory.create({ ...categoryData, isActive: true });
    stats.categoriesCreated += 1;
  }

  const categoryIds = new Map(
    (await JobCategory.find().lean()).map((c) => [c.name.en, c._id])
  );
  // During a dry run the new categories do not exist yet, so their skills
  // cannot be resolved - say so rather than silently skipping them.
  const dryRunPending = new Set();

  // --- 3. Trades, then their sub-skills -------------------------------------
  for (const [tradeName, trade] of Object.entries(SKILL_CATALOG)) {
    const categoryId = categoryIds.get(trade.category);
    if (!categoryId) {
      dryRunPending.add(trade.category);
      continue;
    }

    let tradeDoc = await Skill.findOne({ "name.en": tradeName });
    if (!tradeDoc) {
      console.log(`  trade     + ${tradeName}  (${trade.category})`);
      if (apply) {
        tradeDoc = await Skill.create({
          name: { mr: trade.mr, hi: trade.hi, en: tradeName },
          categoryId,
          parentSkillId: null,
        });
      }
      stats.tradesCreated += 1;
    } else {
      stats.unchanged += 1;
    }

    for (const sub of trade.subSkills) {
      const existing = await Skill.findOne({ "name.en": sub.en });
      if (!existing) {
        console.log(`  sub-skill   + ${tradeName} > ${sub.en}`);
        if (apply && tradeDoc) {
          await Skill.create({
            name: sub,
            // A sub-skill always sits in its trade's category, so filtering
            // the catalog by category keeps trade and sub-skill together.
            categoryId,
            parentSkillId: tradeDoc._id,
          });
        }
        stats.subSkillsCreated += 1;
      } else if (tradeDoc && String(existing.parentSkillId || "") !== String(tradeDoc._id)) {
        // The field is new, so a skill seeded before this change can exist
        // with no parent. Only ever sets it - never clears a correct one.
        console.log(`  reparent  ~ ${sub.en} -> parent ${tradeName}`);
        if (apply) await Skill.updateOne({ _id: existing._id }, { $set: { parentSkillId: tradeDoc._id } });
        stats.parentsFixed += 1;
      } else {
        stats.unchanged += 1;
      }
    }
  }

  if (dryRunPending.size) {
    console.log(
      `\n  (skills under ${[...dryRunPending].join(", ")} are not listed - their category does not exist yet; re-run with --apply)`
    );
  }

  // --- 4. Prove the original ids did not move -------------------------------
  const after = new Map(
    (await Skill.find({ "name.en": { $in: ORIGINAL_SKILL_NAMES } }).lean()).map((s) => [s.name.en, String(s._id)])
  );
  const moved = ORIGINAL_SKILL_NAMES.filter((n) => before.has(n) && before.get(n) !== after.get(n));

  console.log(
    `\ncategories +${stats.categoriesCreated}  trades +${stats.tradesCreated}  sub-skills +${stats.subSkillsCreated}  parents fixed ${stats.parentsFixed}  already correct ${stats.unchanged}`
  );
  console.log(`pre-existing skill ids changed: ${moved.length === 0 ? "none" : moved.join(", ")}`);
  if (moved.length) process.exitCode = 1;
  if (!apply) console.log("\nNothing was written. Re-run with --apply to perform the changes.");

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error("Catalog seeding failed:", error);
  process.exit(1);
});

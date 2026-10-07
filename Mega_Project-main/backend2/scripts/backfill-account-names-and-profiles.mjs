#!/usr/bin/env node
/**
 * Idempotent backfill for the employer-name / multi-role changes.
 *
 * Two things changed that existing documents predate:
 *
 *   1. User.fullName is new. Accounts created before it have no personal
 *      name, so an employer with no businessName would display as nothing.
 *      This copies a name the account already has - WorkerProfile.fullName
 *      first (it IS the person's name), else EmployerProfile.businessName
 *      (the only name such an account ever gave).
 *
 *   2. A declared role now always has its profile. Registration used to skip
 *      the EmployerProfile when no businessName was given, leaving accounts
 *      with the employer role and no profile - every employer endpoint
 *      answers 404 for them. This creates the missing profile.
 *
 * Safe by construction: it only ever FILLS absent values and CREATES missing
 * profiles. Nothing is overwritten, renamed or deleted, so re-running it is a
 * no-op. Defaults to a dry run.
 *
 *   node scripts/backfill-account-names-and-profiles.mjs            # dry run
 *   node scripts/backfill-account-names-and-profiles.mjs --apply    # write
 *   MONGODB_URI=mongodb://127.0.0.1:27017/other node ... --apply
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../src/models/user.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import { createProfilesForRoles } from "../src/utils/profileProvisioning.js";
import { DB_NAME } from "../src/constants.js";

dotenv.config();

const apply = process.argv.includes("--apply");
const baseUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const uri = /\/[^/?]+(\?|$)/.test(baseUri.replace(/^mongodb(\+srv)?:\/\//, "")) ? baseUri : `${baseUri}/${DB_NAME}`;

const main = async () => {
  await mongoose.connect(uri);
  console.log(`${apply ? "APPLYING" : "DRY RUN"} against ${mongoose.connection.name}\n`);

  const users = await User.find().select("_id phone roles fullName").lean();
  const workerNames = new Map(
    (await WorkerProfile.find().select("userId fullName").lean()).map((p) => [String(p.userId), p.fullName])
  );
  const businessNames = new Map(
    (await EmployerProfile.find().select("userId businessName").lean()).map((p) => [String(p.userId), p.businessName])
  );

  let namesFilled = 0;
  let namesUnresolved = 0;
  let profilesCreated = 0;

  for (const user of users) {
    const id = String(user._id);

    if (!user.fullName?.trim()) {
      // WorkerProfile.fullName is a person's name; businessName is only a
      // fallback because it is the one name such an account ever supplied.
      const inherited = workerNames.get(id)?.trim() || businessNames.get(id)?.trim() || null;
      if (inherited) {
        console.log(`  name   ${user.phone}: fullName <- ${JSON.stringify(inherited)}`);
        if (apply) await User.updateOne({ _id: user._id }, { $set: { fullName: inherited } });
        namesFilled += 1;
      } else {
        // Nothing to copy. Left null on purpose - no name is invented, and
        // the display helpers already handle null.
        console.log(`  NAME?  ${user.phone} roles=[${user.roles}] has no name anywhere - left unset`);
        namesUnresolved += 1;
      }
    }

    const missing = [];
    if (user.roles.includes("worker") && !workerNames.has(id)) missing.push("worker");
    if (user.roles.includes("employer") && !businessNames.has(id)) missing.push("employer");
    if (missing.length) {
      console.log(`  profile ${user.phone} roles=[${user.roles}] creating ${missing.join("+")} profile`);
      if (apply) {
        const fresh = await User.findById(user._id);
        await createProfilesForRoles(fresh, missing, {});
      }
      profilesCreated += missing.length;
    }
  }

  console.log(
    `\nnames filled: ${namesFilled}   names with no source: ${namesUnresolved}   profiles created: ${profilesCreated}`
  );
  if (!apply) console.log("\nNothing was written. Re-run with --apply to perform the changes.");
  await mongoose.disconnect();
};

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});

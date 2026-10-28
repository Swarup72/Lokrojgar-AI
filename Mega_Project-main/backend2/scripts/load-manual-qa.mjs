#!/usr/bin/env node
/**
 * CLI Runner for Loading Synthetic Manual QA Profiles into a Dev/Test Database.
 *
 * Usage:
 *   node scripts/load-manual-qa.mjs                     # Dry-run against default test DB (LokRozgar_AI_ManualQA)
 *   node scripts/load-manual-qa.mjs --apply             # Write records to default test DB
 *   node scripts/load-manual-qa.mjs --apply --db=LokRozgar_AI # Write records to local dev DB
 *   node scripts/load-manual-qa.mjs --group=workers     # Dry-run for workers only
 *   node scripts/load-manual-qa.mjs --help              # Display usage instructions
 */

import dotenv from "dotenv";
import { loadManualQaDataset } from "../src/services/manualQa/qaDataLoader.js";

dotenv.config();

function printHelp() {
  console.log(`
LokRozgar AI - Synthetic Manual QA Profile Loader

Usage:
  node scripts/load-manual-qa.mjs [options]

Options:
  --apply                Commit records to database (default: dry-run, no writes)
  --db=<name>            Target database name (default: LokRozgar_AI_ManualQA)
  --group=<group>        Select which records to load:
                           all (default) | workers | employers | jobs | applications | reports
  --data-dir=<path>      Custom directory path containing manual-qa-data files
  --help, -h             Show this help message

Examples:
  # Simulate mapping all QA records without writing
  node scripts/load-manual-qa.mjs

  # Load all QA records into the dedicated test database
  node scripts/load-manual-qa.mjs --apply

  # Load all QA records into the local development database
  node scripts/load-manual-qa.mjs --apply --db=LokRozgar_AI

  # Load only workers and employers
  node scripts/load-manual-qa.mjs --apply --group=workers
`);
}

async function run() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const apply = args.includes("--apply");

  let dbName = "LokRozgar_AI_ManualQA";
  const dbArg = args.find((a) => a.startsWith("--db="));
  if (dbArg) {
    dbName = dbArg.split("=")[1].trim();
  } else if (process.env.QA_DB_NAME) {
    dbName = process.env.QA_DB_NAME;
  }

  let group = "all";
  const groupArg = args.find((a) => a.startsWith("--group="));
  if (groupArg) {
    group = groupArg.split("=")[1].trim().toLowerCase();
  }

  let dataDir = null;
  const dataDirArg = args.find((a) => a.startsWith("--data-dir="));
  if (dataDirArg) {
    dataDir = dataDirArg.split("=")[1].trim();
  }

  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

  try {
    const report = await loadManualQaDataset({
      mongoUri,
      dbName,
      dataDir,
      apply,
      group,
    });

    const hasErrors =
      report.employers.errors.length > 0 ||
      report.workers.errors.length > 0 ||
      report.jobs.errors.length > 0 ||
      report.applications.errors.length > 0 ||
      report.reports.errors.length > 0;

    process.exit(hasErrors ? 1 : 0);
  } catch (err) {
    console.error("\n[FATAL ERROR]:", err.message);
    process.exit(1);
  }
}

run();

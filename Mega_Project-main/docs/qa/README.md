# LokRozgar AI QA Documentation & Data Fixtures

This directory contains QA specifications and documentation for testing LokRozgar AI.

## Quick References

- **QA Guide**: [`MANUAL_QA_DATA_GUIDE.md`](./MANUAL_QA_DATA_GUIDE.md) — Comprehensive guide on profile conventions, load scripts, and test workflows.
- **QA Dataset**: [`../../manual-qa-data/`](../../manual-qa-data/) — Authoritative synthetic datasets (40 workers, 15 employers, 50 jobs, etc.).
- **QA Loader Script**: Located at `backend2/scripts/load-manual-qa-data.mjs`.

## Data Fixtures Summary

All fixtures reside in `manual-qa-data/` at the repository root:
- `workers.json` / `workers.csv`: 40 worker profiles spanning multiple trades, languages (Marathi, Hindi, English), and locations across Maharashtra.
- `employers.json` / `employers.csv`: 15 employer entities.
- `jobs.json` / `jobs.csv`: 50 jobs across multiple categories (Domestic & Hospitality, Construction Work, Agriculture, Repair & Technical, Transportation).
- `applications.json` / `applications.csv`: Sample application workflows.
- `matching_pairs.json` / `matching_pairs.csv`: Ground-truth pairs for verifying matching algorithms.
- `fraud_scenarios.json` / `fraud_scenarios.csv`: Suspicious patterns for fraud detection verification.
- `reports.json` / `reports.csv`: Sample user issue reports.
- `negative_test_cases.json` / `negative_test_cases.csv`: Edge cases and invalid payloads for validation testing.

## Safe Testing Protocol

Always run the QA data loader in dry-run mode first:
```bash
cd backend2
npm run load:qa
```
Do **NOT** pass `--apply` unless explicitly instructed to populate a dedicated QA test database (`LokRozgar_AI_Manual_QA`). Production database (`LokRozgar_AI`) must never be modified.

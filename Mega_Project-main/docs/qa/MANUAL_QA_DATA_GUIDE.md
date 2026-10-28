# LokRozgar AI - Manual QA Profile & Dataset Integration Guide

This guide describes how the synthetic manual QA dataset is integrated into LokRozgar AI, how to load the profiles into an isolated test database, credentials for manual login, and a manual checklist for inspecting all functional scenarios.

---

## 1. Overview & Dataset Location

The synthetic manual QA dataset contains realistic Marathi, English, and mixed-language profiles, job listings, applications, and trust/safety scenarios:

- `workers.json` (40 worker profiles: Marathi, English, mixed; skills, experience, pay, availability, ratings)
- `employers.json` (15 employers: verification statuses, normal and high-volume posting patterns, suspended account)
- `jobs.json` (50 job listings: Marathi/English equivalents, duplicates, bulk hiring, different pay types, suspicious postings)
- `applications.json` (10 hiring relationship examples: applied, accepted, rejected, completed)
- `matching_pairs.json` (42 worker/job combinations with qualitative matching expectations)
- `fraud_scenarios.json` (12 fraud and false-positive moderation scenarios)
- `reports.json` (8 user complaints and dispute reports)
- `negative_test_cases.json` (15 invalid-input cases; audited against schema rules, NOT inserted as valid DB rows)

### Dataset Path
The dataset files are located at:
```
Mega_Project-main/manual-qa-data/
```
(Also mirrored at workspace root: `/manual-qa-data/`)

---

## 2. Safe Manual QA Data Loader

The loader script is located at:
```
backend2/scripts/load-manual-qa-data.mjs
```
Backed by the schema mapping layer:
```
backend2/scripts/qaDataMapper.mjs
```

### Safety Features
- **Default Database**: Loads into an isolated database named `LokRozgar_AI_Manual_QA` by default. The main development database (`LokRozgar_AI`) is never touched unless explicitly passed.
- **Production Guard**: Hard-aborts immediately if `NODE_ENV === "production"`.
- **Localhost Guard**: Only connects to local MongoDB instances (`127.0.0.1` / `localhost`) unless `--force-remote-test` is provided.
- **Dry-Run by Default**: Safe to execute anytime. Writing to MongoDB requires the explicit `--apply` flag.
- **Idempotent**: Uses deterministic MongoDB ObjectIds (`_id`) and unique keys (phone, email, `{jobId, workerId}`). Repeated runs update/preserve existing records with **zero duplicate documents created**.
- **No External Side Effects**: No SMS, emails, WhatsApp messages, socket broadcasts, or notifications are triggered.
- **Proper Authentication**: Passwords (`Test@12345`) are hashed with `bcrypt` via Mongoose pre-save hooks so accounts can be used to log in manually via the normal web UI.

---

## 3. How to Run the Loader

Navigate to `Mega_Project-main/backend2`:

```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/backend2
```

### A. Dry Run (Inspect & Validate without Writing)
```bash
node scripts/load-manual-qa-data.mjs
# or using npm
npm run load:qa
```

### B. Apply to Isolated Test Database (`LokRozgar_AI_Manual_QA`)
```bash
node scripts/load-manual-qa-data.mjs --apply
# or using npm
npm run load:qa:apply
```

### C. Apply to Main Local Dev Database (`LokRozgar_AI`)
```bash
node scripts/load-manual-qa-data.mjs --db=LokRozgar_AI --apply
```

### D. Load Selected Record Groups Only
```bash
node scripts/load-manual-qa-data.mjs --groups=workers,employers --apply
node scripts/load-manual-qa-data.mjs --groups=jobs --apply
node scripts/load-manual-qa-data.mjs --groups=applications,reports --apply
```

### E. CLI Options Reference
| Flag | Description | Default |
|---|---|---|
| `--apply` | Commit mapped records to MongoDB | `false` (Dry Run) |
| `--dry-run` | Run schema validation without writing | `true` |
| `--db=<name>` | Target database name | `LokRozgar_AI_Manual_QA` |
| `--data-dir=<path>` | Custom directory for dataset files | Auto-discovered |
| `--groups=<list>` | Comma-separated groups: `workers,employers,jobs,applications,reports` | All groups |
| `--password=<pass>` | Default login password for QA accounts | `Test@12345` |
| `--no-tag-names` | Omit `[QA:ID]` suffix from names/titles | Disabled (tags added) |
| `--help` | Display CLI help text | - |

---

## 4. How to Verify Database Isolation

To confirm that your running backend is connected to the intended test database:

1. In `backend2/.env`, set:
   ```env
   DB_NAME=LokRozgar_AI_Manual_QA
   ```
2. When starting backend2 (`npm run dev`), inspect the startup banner in the console:
   ```
   MongoDB connected !! DB HOST:127.0.0.1 DB NAME:LokRozgar_AI_Manual_QA
   ```
3. To switch back to normal dev data at any time, revert `DB_NAME=LokRozgar_AI`.

---

## 5. Account Credentials for Manual Inspection (Isolated Test Database Only)

> [!WARNING]
> These synthetic accounts and credentials are intended **strictly for local manual verification within the isolated development/test database** (`LokRozgar_AI_Manual_QA`). They must never be loaded into, referenced in, or deployed to any staging or production environment.

All synthetic accounts have the default password: **`Test@12345`**

### Administrator
- **Phone**: `+919999999999` (or `9999999999`)
- **Password**: `Admin@12345`
- **Role**: `admin`
- **Portal URL**: `/admin` or `/admin/login`

### Key Worker Accounts (`/login`)
| Profile ID | Name | Phone | Language | Experience | Rating | Key Feature / Scenario |
|---|---|---|---|---|---|---|
| **W001** | अमोल पाटील | `+919000000001` | Marathi | 4 yrs | 4.6 | Standard Marathi Electrician |
| **W002** | Amit Patil | `+919000000002` | English | 4 yrs | 4.6 | English Electrician (counterpart of W001) |
| **W003** | स्नेहा शिंदे | `+919000000003` | Marathi | 3 yrs | 4.8 | Female Marathi Plumber |
| **W004** | Rahul Jadhav | `+919000000004` | English | 6 yrs | 4.2 | Mechanic, **Status: Busy** |
| **W007** | प्रिया कदम | `+919000000007` | Marathi | 5 yrs | 4.5 | Painter, **Status: Unavailable** |
| **W013** | रोहन पाटील | `+919000000013` | Marathi | 2 yrs | 3.9 | Mixed Marathi-English Electrician |
| **W021** | अक्षय पाटील | `+919000000021` | Marathi | 0 yrs | 0.0 | **Zero experience, Unrated (Cold-start)** |
| **W024** | Rafiq Shaikh | `+919000000024` | English | 5 yrs | 2.8 | Low rating (2.8), Carpenter |
| **W027** | अभिजित माने | `+919000000027` | Marathi | 2 yrs | 3.9 | Monthly pay expectation (₹18,000) |
| **W035** | किशोर पाटील | `+919000000035` | Marathi | 15 yrs | 4.7 | Extensive experience (15 yrs), Multi-skilled |
| **W040** | Joseph D'Souza | `+919000000040` | English | 11 yrs | 4.8 | Senior English Cook (cross-language) |

### Key Employer Accounts (`/login`)
| Profile ID | Business Name | Phone | Language | Status | Verification | Pattern / Note |
|---|---|---|---|---|---|---|
| **E001** | कोल्हापूर इलेक्ट्रिकल सर्व्हिसेस | `+919110000001` | Marathi | Active | Verified | Standard verified employer |
| **E002** | Patil Plumbing & Repairs | `+919110000002` | English | Active | Verified | English plumbing business |
| **E003** | सह्याद्री कन्स्ट्रक्शन | `+919110000003` | Marathi | Active | **Pending** | Unverified / Pending review |
| **E013** | Urgent Job Agency | `+919110000013` | English | Active | **Rejected** | High-risk upfront fee jobs (J020, J021) |
| **E014** | नवजीवन रोजगार सेवा | `+919110000014` | Marathi | **Suspended** | Pending | Blocked account (`isBlocked: true`) |
| **E015** | BrightBuild Contractors | `+919110000015` | English | Active | Verified | Legitimate bulk hiring (J022) |

---

## 6. Schema Mapping & Incompatibilities Resolved

| Dataset Entity & Field | LokRozgar Mongoose Model & Field | Mapping / Sanitization Applied |
|---|---|---|
| **Phone with hyphens** (`+91-90000-00001`) | `User.phone` | Stripped hyphens: `+919000000001` to satisfy `/^(?:\+91)?[6-9]\d{9}$/`. |
| **Worker Profile ID** (`W001`) | `User._id`, `WorkerProfile._id` | Deterministic ObjectId namespace `lokrozgar_qa_worker_W001`. |
| **Worker Name** | `WorkerProfile.fullName`, `User.fullName` | Tagged as `${name} [QA:W001]` for instant visual identification. |
| **Worker Bio** | `WorkerProfile.bio` (`{ mr, hi, en }`) | Stored in preferred language with `[QA Profile: W001]` metadata note. |
| **Worker Skills** (Free-text array) | `WorkerSkill` documents | Resolved against canonical catalog `Skill` docs with trade synonyms. |
| **Worker Rating Count** | `WorkerProfile.ratingCount` | Set to `0` when rating is missing/0; derived from rating when > 0. |
| **Employer Status: suspended** | `User.isBlocked: true` | Correctly prevents login and flags in admin management table. |
| **Employer Verification** | `EmployerProfile.isVerified: boolean` | Mapped `"verified" -> true`, `"pending"/"rejected" -> false`. |
| **Job Location Coordinates** | `Job.location.coordinates` | Mapped from city names to standard Maharashtra GeoJSON `[lng, lat]`. |
| **Job Pay Type** (`pay_type`) | `Job.payType` | Mapped to enum `["daily", "monthly", "fixed"]`. |
| **Job Category** | `Job.categoryId` | Resolved from skill catalog parent category or Construction baseline. |
| **Job Title & Description** | `Job.title`, `Job.description` | Stored in `{ mr, hi, en }` structure with `[QA:J001]` tag. |
| **Application Status: pending** | `Application.status: "applied"` | Mapped `"pending"` to supported enum `APPLICATION_STATUS.APPLIED`. |
| **Report / Complaint** | `Dispute` model | Mapped to `Dispute` model which powers Admin Reports & Complaints UI. |

---

## 7. Negative Test Cases Compliance Audit

The 15 negative test cases from `negative_test_cases.json` were audited directly against actual project schemas and validators:

| Case ID | Entity | Field | Test Value | Expected Behavior | Actual Application Mechanism |
|---|---|---|---|---|---|
| **N001** | worker | `availability` | `"sometimes"` | Reject invalid enum | Mongoose enum `["available", "busy", "unavailable"]` rejects value. |
| **N002** | worker | `experience_years` | `-1` | Reject negative experience | Schema validation `min: 0` rejects negative numbers. |
| **N003** | worker | `preferred_language`| `"xx"` | Reject unsupported language | Enum `PREFERRED_LANGUAGES` (`['mr', 'hi', 'en']`) rejects value. |
| **N004** | worker | `expected_pay` | `-500` | Reject negative pay | Schema validation `min: 0` rejects negative values. |
| **N005** | job | `title` | `""` (empty) | Reject missing title | Custom validator enforces at least one non-empty language title. |
| **N006** | job | `description` | 20,000 chars | Enforce max length | API validator rejects descriptions exceeding 5,000 characters. |
| **N007** | job | `pay_type` | `"hourly-ish"` | Reject unsupported enum | Enum `["daily", "monthly", "fixed"]` rejects invalid type. |
| **N008** | report | `target_id` | `"not-an-object-id"` | Reject invalid ID | Mongoose `CastError` rejects non-ObjectId string. |
| **N009** | report | `description` | `<script>alert(1)</script>` | Prevent script injection | React frontend JSX automatically escapes text nodes, preventing XSS. |
| **N010** | job | `extra` | Mass-assignment object | Reject unauthorized fields | Mongoose `strict: true` strips unmodeled keys automatically. |
| **N011** | job | `title` | `{ "$ne": null }` | Reject query operator object | Type casting requires string; object input fails validation. |
| **N012** | admin | `actionType` | `"permanently_ban_everyone"` | Reject unsupported action | Controller checks against whitelist of permitted admin action types. |
| **N013** | report | `reporter_id` | `"fake-admin-id"` | Use authenticated identity | `dispute.controller.js` reads identity from `req.user._id`, ignoring body. |
| **N014** | worker | `skills` | `[]` (empty) | Handle safely | Schema permits empty skills without crashing; worker marked as unspecialized. |
| **N015** | worker | `bio` | Unicode + Emoji | Preserve Unicode | UTF-8 DB connection and models preserve Marathi Devanagari and emojis. |

---

## 8. Manual Verification Checklist

Follow this checklist to manually verify the application using the loaded records:

### A. Authentication & Account Access
- [ ] Log in as Admin (`+919999999999` / `Admin@12345`) at `/admin/login`. Verify dashboard loads summary counts.
- [ ] Log in as Marathi Worker W001 (`+919000000001` / `Test@12345`) at `/login`. Verify profile displays in Marathi.
- [ ] Log in as English Worker W002 (`+919000000002` / `Test@12345`). Verify profile displays in English.
- [ ] Attempt login as Suspended Employer E014 (`+919110000014` / `Test@12345`). Verify system displays account blocked message.

### B. Language & Unicode Rendering
- [ ] Open Job Details for J001 (`घरगुती वायरिंगसाठी इलेक्ट्रिशियन हवा [QA:J001]`). Verify Marathi Devanagari renders correctly.
- [ ] Search for "इलेक्ट्रिशियन" on the Jobs page (`/jobs`). Verify matching Marathi jobs appear.
- [ ] Switch language toggle to Marathi (`मराठी`). Verify UI labels switch seamlessly.
- [ ] Open Worker Profile W013 (`रोहन पाटील [QA:W013]`). Verify mixed Marathi and English skills display without distortion.

### C. Worker Profiles & Edge Cases
- [ ] **Cold Start**: View Worker W021 (`अक्षय पाटील [QA:W021]`). Verify 0 years experience and "New" / 0 rating display properly.
- [ ] **Extensive Experience**: View Worker W035 (`किशोर पाटील [QA:W035]`). Verify 15 years experience and 4.7 rating display properly.
- [ ] **Low Rating**: View Worker W024 (`Rafiq Shaikh [QA:W024]`). Verify 2.8 rating displays properly with active profile status.
- [ ] **Availability**: View Worker W004 (`Rahul Jadhav` - Busy) and W007 (`प्रिया कदम` - Unavailable). Verify status pills display "Busy" and "Unavailable".
- [ ] **Pay Range**: Verify expected pay displays accurately in INR (₹) across workers from ₹400 daily (W037) to ₹18,000 monthly (W027).

### D. Employer & Job Listings
- [ ] **Verified Employer**: View Employer E001 (`कोल्हापूर इलेक्ट्रिकल सर्व्हिसेस`). Verify verified badge displays.
- [ ] **Pending Employer**: View Employer E003 (`सह्याद्री कन्स्ट्रक्शन`). Verify pending verification status.
- [ ] **Pay Types**: Inspect J001 (Daily ₹900), J007 (Monthly ₹24,000), J014 (Fixed ₹2,500). Verify pay amounts and frequency units render accurately.
- [ ] **Duplicate Listings**: Compare J001 (Marathi) and J002 (English equivalent). Compare J018 and J019 (English duplicate and near-duplicate of J002).
- [ ] **Bulk Hiring**: View J022 (`Construction labourers needed for new site`). Verify required worker count is 12 (matching description: "Need 12 labourers").
- [ ] **Scam Listing**: View J020 (`Urgent work: pay registration fee first`). Inspect fee demand in description.

### E. Matching & Recommendations
- [ ] As Worker W001 (Kolhapur Electrician), view Recommended Jobs (`/jobs`). Verify J001 (Kolhapur Electrician) ranks near the top.
- [ ] As Worker W002 (English Electrician), view Recommended Jobs. Verify cross-language matching ranks J001 high despite Marathi text.
- [ ] Check Location Sensitivity: Verify Kolhapur workers receive Kolhapur jobs first, with distant Mumbai jobs ranked lower or filtered.
- [ ] Check Availability Impact: Worker W004 (Busy) receives a reduced availability factor (40%) compared to Available workers (100%).

### F. Reports & Admin Moderation
- [ ] Log in as Admin and open Reports & Complaints (`/admin/reports`).
- [ ] Verify 8 dispute cases (R001 to R008) are listed.
- [ ] Inspect R001 & R003: Verify repeated reports against the same job (J020) by the same worker (W001) are visible.
- [ ] Inspect R002: Verify corroborating report against J020 by an independent worker (W003).
- [ ] Inspect R008: Verify Marathi report description renders properly.
- [ ] Test Action: Click "Resolve" or "Under Review" on a report and confirm status transitions successfully.

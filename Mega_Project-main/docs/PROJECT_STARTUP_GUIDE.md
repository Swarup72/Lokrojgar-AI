# LokRozgar AI — Complete Project Installation, Startup, and Verification Guide

> **Target Platform**: macOS (Apple Silicon / Intel)  
> **Repository Root**: `/Users/swaruppal/Desktop/Lokrojgar`  
> **Application Root**: `/Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main`  
> **Audit Status**: Verified against active repository code, database instances, and actual local runtime execution.

---

## Table of Contents
1. [Repository Topology & Component Map](#1-repository-topology--component-map)
2. [Section A: Prerequisites](#section-a-prerequisites)
3. [Section B: First-Time Setup & Installation](#section-b-first-time-setup--installation)
4. [Section C: Manual QA Data Setup & Safety Guardrails](#section-c-manual-qa-data-setup--safety-guardrails)
5. [Section D: Normal Daily Startup Sequence](#section-d-normal-daily-startup-sequence)
6. [Section E: Application Verification & Health Checks](#section-e-application-verification--health-checks)
7. [Section F: Testing & Build Commands](#section-f-testing--build-commands)
8. [Section G: Comprehensive Troubleshooting](#section-g-comprehensive-troubleshooting)
9. [Section H: Graceful Shutdown & Next-Day Restart](#section-h-graceful-shutdown--next-day-restart)
10. [Section I: Final Quick-Start Checklist & Verification Table](#section-i-final-quick-start-checklist--verification-table)
11. [Minimum Commands for Tomorrow](#minimum-commands-for-tomorrow)

---

## 1. Repository Topology & Component Map

The project contains three core services and a synthetic test dataset organized under `Mega_Project-main`:

```
/Users/swaruppal/Desktop/Lokrojgar/
├── Mega_Project-main/
│   ├── backend2/                # Active Node.js/Express backend (Port 8000)
│   │   ├── src/                 # Application code (index.js, app.js, routes, models)
│   │   ├── scripts/             # QA loader (load-manual-qa-data.mjs, qaDataMapper.mjs)
│   │   ├── docs/                # Architecture & QA manuals (MANUAL_QA_DATA_GUIDE.md)
│   │   ├── tests/               # Native Node.js test suite (*.test.js)
│   │   ├── .env                 # Local backend configuration (MONGODB_URI, PORT=8000)
│   │   └── package.json         # Scripts: start, dev, load:qa, load:qa:apply
│   │
│   ├── frontend/                # React 19 + Vite 8 single-page application (Port 5173)
│   │   ├── src/                 # UI components, pages, context, and i18n
│   │   ├── tests/               # Node runner unit/component tests (*.test.mjs)
│   │   ├── .env                 # Frontend configuration (VITE_API_BASE_URL)
│   │   └── package.json         # Scripts: dev, build, lint, test, preview
│   │
│   ├── ai-service/              # Python FastAPI microservice (Port 8001)
│   │   ├── app/                 # FastAPI routes (recommendations, voice, translation, skills)
│   │   ├── tests/               # Pytest test suite (613 unit and integration tests)
│   │   ├── .venv/               # Dedicated Python 3.12 virtual environment
│   │   ├── .env                 # AI service configuration (PORT=8001, models, keys)
│   │   └── requirements.txt     # Python dependencies (fastapi, uvicorn, torch, whisper, etc.)
│   │
│   ├── manual-qa-data/          # Ground-truth synthetic dataset (JSON & CSV files)
│   └── backend/                 # Legacy backend (inactive/deprecated; superseded by backend2)
└── manual-qa-data/              # Root workspace mirror of synthetic dataset
```

---

## Section A: Prerequisites

Before running any service, verify that required runtimes and tools are installed.

### 1. Required Versions
- **Node.js**: `v20.x` or higher (Host verified: `v26.11.1`)
- **npm**: `v10.x` or higher (Host verified: `v11.20.0`)
- **Python**: `3.10` - `3.12` (Host verified: `Python 3.12.3`)
- **MongoDB**: `v6.0` - `v8.0` Community Edition (Host verified: `v8.0.32`, mongosh `2.13.0`)
- **FFmpeg**: Required for audio transcoding in `ai-service` (Host verified: `v8.1` at `/opt/homebrew/bin/ffmpeg`)

### 2. Version Verification Commands

Run these commands from your macOS Terminal to verify your environment:

```bash
# Verify Node and npm
node -v
npm -v

# Verify Python
python3 --version

# Verify MongoDB Client and Server
mongosh --version
mongod --version | head -n 1

# Verify FFmpeg
ffmpeg -version | head -n 1
```

If any tool is missing, install it via Homebrew:
```bash
brew install node python@3.12 mongodb-community ffmpeg
```

---

## Section B: First-Time Setup & Installation

Follow these exact steps when cloning or setting up the repository on a fresh machine.

### Step 1: Navigate to Main Project Root
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main
```

### Step 2: Install Backend (`backend2`) Dependencies
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/backend2
npm install
```
*Purpose*: Installs Express, Mongoose, Socket.io, AWS SDK (Backblaze B2), Multer, Nodemon, and other server dependencies. Run once on setup or whenever `backend2/package.json` changes.

### Step 3: Install Frontend Dependencies
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/frontend
npm install
```
*Purpose*: Installs React 19, Vite 8, Lucide React, Axios, React Router 7, and Oxlint. Run once on setup or whenever `frontend/package.json` changes.

### Step 4: Configure Python Virtual Environment for AI Service
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/ai-service
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```
*Purpose*: Creates an isolated Python virtual environment and installs FastAPI, Uvicorn, PyTorch, OpenAI Whisper / MLX Whisper, and Pydantic. Run once on setup or whenever `requirements.txt` changes.

### Step 5: Configure Environment Files
The repository includes `.env.example` templates for all three services. Configure them without overwriting any existing custom keys:

#### 1. Backend Configuration (`backend2/.env`)
If `backend2/.env` does not exist:
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/backend2
cp -n .env.example .env
```
Ensure the following variable names are configured:
- `PORT=8000`
- `NODE_ENV=development`
- `CORS_ORIGIN=*`
- `MONGODB_URI=mongodb://127.0.0.1:27017`
- `DB_NAME=LokRozgar_AI` *(or `LokRozgar_AI_Manual_QA` for QA data testing)*
- `ACCESS_TOKEN_SECRET=<your-access-secret>`
- `REFRESH_TOKEN_SECRET=<your-refresh-secret>`
- `ACCESS_TOKEN_EXPIRY=1d`
- `REFRESH_TOKEN_EXPIRY=10d`
- `AI_SERVICE_URL=http://localhost:8001`
- `AI_SERVICE_API_KEY=` *(Optional in local development; keep empty if not used)*
- `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_REGION`, `B2_ENDPOINT` *(For voice profile storage)*

#### 2. Frontend Configuration (`frontend/.env`)
If `frontend/.env` does not exist:
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/frontend
cp -n .env.example .env
```
Ensure the API base URL points to the Node backend:
```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

#### 3. AI Service Configuration (`ai-service/.env`)
If `ai-service/.env` does not exist:
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/ai-service
cp -n .env.example .env
```
Ensure the service port is set to `8001` (to prevent collision with port 8000):
- `PORT=8001`
- `AI_SERVICE_URL=http://localhost:8001`
- `STT_PROVIDER=mlx_whisper` *(Apple Silicon default)* or `whisper` *(Intel Mac default)*
- `SARVAM_API_KEY=` *(Optional: required only for Sarvam-backed voice/translation calls)*

---

## Section C: Manual QA Data Setup & Safety Guardrails

The project includes an isolated synthetic dataset representing 40 worker profiles, 15 employers, 50 jobs, 10 applications, and 8 dispute reports.

### Architecture & Safety Verification
- **Loader Script**: `Mega_Project-main/backend2/scripts/load-manual-qa-data.mjs`
- **Mapper Layer**: `Mega_Project-main/backend2/scripts/qaDataMapper.mjs`
- **Default Database Target**: `LokRozgar_AI_Manual_QA` (strictly isolated from default dev database `LokRozgar_AI`).
- **Production Safeguard**: Script hard-aborts if `process.env.NODE_ENV === "production"` or if connecting to a non-local MongoDB URI.
- **Dry-Run by Default**: Executing `npm run load:qa` performs 100% schema validation and in-memory entity mapping, writing **zero documents** to MongoDB.
- **Idempotency**: All records use deterministic MongoDB ObjectIds derived from entity identifiers (e.g. `W001`, `E001`, `J001`) and unique indexes (`phone`, `email`, compound `{jobId, workerId}`). Repeated runs update or skip records without creating duplicates.
- **Side Effect Free**: Does not trigger external SMS, WhatsApp, email, or socket broadcast events.

### QA Dataset Commands (Run from `Mega_Project-main/backend2`)

#### 1. Safe Dry Run (Validation Only — Zero Database Writes)
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/backend2
npm run load:qa
```
*Expected Output*:
```
Mode:            DRY RUN (Validation only)
Database:        LokRozgar_AI_Manual_QA
...
Status:       DRY RUN COMPLETE (No writes occurred)
Workers:      Total: 40 | Created: 40 | Errors: 0
Employers:    Total: 15 | Created: 15 | Errors: 0
Jobs:         Total: 50 | Created: 50 | Errors: 0
Applications: Total: 10 | Created: 10 | Errors: 0
Reports:      Total:  8 | Created:  8 | Errors: 0
```

#### 2. Apply Data to Isolated Test Database (`LokRozgar_AI_Manual_QA`)
> [!NOTE]
> Only run this when you wish to write or refresh the synthetic test profiles in `LokRozgar_AI_Manual_QA`.
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/backend2
npm run load:qa:apply
```

#### 3. Switch Backend Between Databases
To test the QA dataset in your browser UI:
1. In `Mega_Project-main/backend2/.env`, set:
   ```env
   DB_NAME=LokRozgar_AI_Manual_QA
   ```
2. Restart the backend (`npm run dev`). Look for the banner:
   ```
   MongoDB connected !! DB HOST:127.0.0.1 DB NAME:LokRozgar_AI_Manual_QA
   ```
3. To return to normal development data, set `DB_NAME=LokRozgar_AI` and restart.

---

## Section D: Normal Daily Startup Sequence

Start services in separate terminal tabs in the following order.

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   Terminal 1    │  ──>  │   Terminal 2    │  ──>  │   Terminal 3    │
│ MongoDB (27017) │       │ Backend (8000)  │       │ Frontend (5173) │
└─────────────────┘       └─────────────────┘       └─────────────────┘
                                   │
                                   ▼ (Optional for Voice/STT)
                          ┌─────────────────┐
                          │   Terminal 4    │
                          │ AI Service(8001)│
                          └─────────────────┘
```

### Terminal 1: MongoDB Service
Verify or start local MongoDB:
```bash
brew services start mongodb-community
```
*Or run in foreground if preferred*:
```bash
mongod --config /opt/homebrew/etc/mongod.conf
```
*Verification*:
```bash
mongosh --quiet --eval "db.adminCommand('ping')"
# Output: { ok: 1 }
```

---

### Terminal 2: Node.js Backend Service
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/backend2
npm run dev
```
- **Port**: `8000`
- **Expected Startup Banner**:
  ```
  [nodemon] 3.1.14
  [nodemon] to restart at any time, enter `rs`
  [nodemon] watching path(s): *.*
  [nodemon] starting `node src/index.js`
  MongoDB connected !! DB HOST:127.0.0.1 DB NAME:LokRozgar_AI
  ⚙️ Server is running at port : 8000
  ```
- **Common Failure Indicators**:
  - `MONGO db connection failed !!!`: MongoDB is not running on port 27017.
  - `EADDRINUSE: address already in use :::8000`: Another process occupies port 8000.

---

### Terminal 3: React / Vite Frontend
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/frontend
npm run dev
```
- **Port**: `5173`
- **Expected Startup Message**:
  ```
    VITE v8.3.1  ready in 208 ms

    ➜  Local:   http://localhost:5173/
    ➜  Network: use --host to expose
    ➜  press h + enter to show help
  ```
- **Browser URL**: Open [http://localhost:5173](http://localhost:5173)

---

### Terminal 4: Python AI Service (Required for Voice, STT, and Match Ranking)
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/ai-service
.venv/bin/uvicorn app.main:app --port 8001 --reload
```
- **Port**: `8001`
- **Expected Startup Message**:
  ```
  INFO:     Uvicorn running on http://127.0.0.1:8001 (Press CTRL+C to quit)
  INFO:     Started reloader process [...]
  INFO:     Started server process [...]
  INFO:     Waiting for application startup.
  INFO:     Application startup complete.
  ```
- **Failure Indicator**:
  - `ERROR: [Errno 48] Address already in use`: Process already bound to port 8001.

---

## Section E: Application Verification & Health Checks

Verify your running stack with these verified endpoints:

### 1. Backend Service Liveness
```bash
curl -s http://localhost:8000/health
```
*Expected Response*:
```json
{"status":"OK","uptime":12.4,"timestamp":"2026-10-26T18:16:00.712Z"}
```

### 2. Backend API v1 Route Status
```bash
curl -s http://localhost:8000/api/v1/status
```
*Expected Response*:
```json
{"success":true,"message":"API v1 operational","timestamp":"2026-10-26T18:16:00.730Z"}
```

### 3. AI Service Health Endpoint
```bash
curl -s http://localhost:8001/health
```
*Expected Response*:
```json
{"status":"ok"}
```

### 4. Frontend Availability
```bash
curl -s -I http://localhost:5173
```
*Expected Response*:
```
HTTP/1.1 200 OK
Content-Type: text/html
```

### 5. Manual QA Test Accounts (When `DB_NAME=LokRozgar_AI_Manual_QA`)
Open [http://localhost:5173/login](http://localhost:5173/login) in your browser:

| Role | Name / Identifier | Phone Number | Password | Key Feature Under Test |
|---|---|---|---|---|
| **Admin** | Administrator | `+919999999999` | `Admin@12345` | Moderation, Disputes, Analytics (`/admin`) |
| **Worker** | अमोल पाटील (W001) | `+919000000001` | `Test@12345` | Marathi Electrician, 4 yrs exp, 4.6 rating |
| **Worker** | Amit Patil (W002) | `+919000000002` | `Test@12345` | English Electrician counterpart |
| **Worker** | राहुल जाधव (W004) | `+919000000004` | `Test@12345` | Status: Busy (`availability: "busy"`) |
| **Employer** | कोल्हापूर इलेक्ट्रिकल (E001) | `+919110000001` | `Test@12345` | Verified Employer, Marathi postings |
| **Employer** | Patil Plumbing (E002) | `+919110000002` | `Test@12345` | Verified Employer, English postings |
| **Employer** | Urgent Job Agency (E013) | `+919110000013` | `Test@12345` | Rejected Verification, Suspicious upfront fees |

---

## Section F: Testing & Build Commands

All tests use native, isolated runners and do not pollute databases or external APIs.

### 1. Frontend Tests & Linting
Run from `/Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/frontend`:

```bash
# 1. Unit & Component Tests (137 tests covering components, routing, i18n, voice flows)
npm test

# 2. Fast Linter (Oxlint)
npm run lint

# 3. Production Build Validation
npm run build
```

### 2. Backend Unit Tests
Run from `/Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/backend2`:

```bash
# Run all unit tests using Node.js native test runner
node --test 'tests/**/*.test.js'

# Or run specific targeted test suites:
node --test tests/aiService.client.test.js
node --test tests/translation.service.test.js
node --test tests/auth.controller.test.js
node --test tests/job.controller.test.js
```

### 3. AI Service Tests
Run from `/Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/ai-service`:

```bash
# Run complete test suite (613 tests covering matching, MLX Whisper, STT, and translation)
.venv/bin/pytest

# Run fast matching/ranking tests only (excludes slow audio/STT tests)
.venv/bin/pytest tests/test_recommendation.py tests/test_ranking.py
```

---

## Section G: Comprehensive Troubleshooting

### 1. Port 8000, 8001, or 5173 Already in Use
**Symptom**: `EADDRINUSE: address already in use :::8000` or `[Errno 48] Address already in use`.  
**Resolution**:
```bash
# Identify process holding the port
lsof -i :8000 -i :8001 -i :5173

# Gracefully terminate the process by PID
kill <PID>

# Force terminate if hung
kill -9 <PID>
```

### 2. MongoDB Connection Refused
**Symptom**: `MONGO db connection failed !!! MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017`.  
**Resolution**:
```bash
# Check if brew service is active
brew services list | grep mongodb

# Restart MongoDB
brew services restart mongodb-community

# Ping to verify
mongosh --quiet --eval "db.adminCommand('ping')"
```

### 3. Missing or Misconfigured Environment Variables
**Symptom**: `JWT secret is not configured` or `UnhandledPromiseRejection`.  
**Resolution**:
- Ensure `.env` exists in `backend2/`, `frontend/`, and `ai-service/`.
- Verify `backend2/.env` contains `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET`.
- Verify `backend2/.env` has `AI_SERVICE_URL=http://localhost:8001`.

### 4. CORS Failure Between Frontend & Backend
**Symptom**: Browser console displays `Cross-Origin Request Blocked` or `CORS preflight did not succeed`.  
**Resolution**:
- Check `backend2/.env`: Ensure `CORS_ORIGIN=*` (or matches `http://localhost:5173`).
- In `backend2/src/app.js`, CORS is registered prior to rate limiting to preserve CORS headers on error responses.

### 5. AI Service FFmpeg Error
**Symptom**: `FileNotFoundError: [Errno 2] No such file or directory: 'ffmpeg'` during voice transcription.  
**Resolution**:
```bash
brew install ffmpeg
which ffmpeg
# Must output: /opt/homebrew/bin/ffmpeg or /usr/local/bin/ffmpeg
```

### 6. Accidental Target Database Selection
**Symptom**: Missing new manual test accounts or seeing empty lists after starting the backend.  
**Resolution**:
- Verify which database the backend connected to in the console:
  `MongoDB connected !! DB HOST:127.0.0.1 DB NAME:<DB>`
- If you need QA test profiles, change `DB_NAME=LokRozgar_AI_Manual_QA` in `backend2/.env`.
- If you need primary dev profiles, change `DB_NAME=LokRozgar_AI`.

---

## Section H: Graceful Shutdown & Next-Day Restart

### Graceful Shutdown
1. **Terminal 2 (Backend)**: Press `Ctrl + C`.  
   *The backend captures `SIGINT` and executes `gracefulShutdown`, cleanly terminating Socket.io, open HTTP listeners, and the MongoDB connection.*
2. **Terminal 3 (Frontend)**: Press `Ctrl + C` to stop the Vite development server.
3. **Terminal 4 (AI Service)**: Press `Ctrl + C` to shut down Uvicorn.
4. **Terminal 1 (MongoDB)**: Leave running via `brew services`, or stop via:
   ```bash
   brew services stop mongodb-community
   ```

### Data Persistence
- All collections and records in `LokRozgar_AI` and `LokRozgar_AI_Manual_QA` persist permanently on disk in `/opt/homebrew/var/mongodb`.
- Stopping the servers does **not** erase user accounts, jobs, or uploaded assets.

---

## Section I: Final Quick-Start Checklist & Verification Table

### Complete Verification Table

| Command | Purpose | Working Directory | Verified by Inspection | Actually Executed | Result / Output |
|---|---|---|:---:|:---:|---|
| `mongosh --eval "db.adminCommand('ping')"` | Verify MongoDB server status | Any | Yes | **Yes** | `{ ok: 1 }` |
| `npm run dev` | Start backend with nodemon | `Mega_Project-main/backend2` | Yes | **Yes** | Connected to MongoDB on port 8000 |
| `curl -s http://localhost:8000/health` | Backend health check | Any | Yes | **Yes** | `{"status":"OK","uptime":...}` |
| `curl -s http://localhost:8000/api/v1/status` | Backend API status | Any | Yes | **Yes** | `{"success":true,"message":"API v1 operational"}` |
| `npm run dev` | Start Vite frontend dev server | `Mega_Project-main/frontend` | Yes | **Yes** | Ready in 208 ms on port 5173 |
| `curl -s -I http://localhost:5173` | Frontend HTTP headers check | Any | Yes | **Yes** | `HTTP/1.1 200 OK` |
| `.venv/bin/uvicorn app.main:app --port 8001` | Start FastAPI AI microservice | `Mega_Project-main/ai-service` | Yes | **Yes** | Uvicorn running on 8001 |
| `curl -s http://localhost:8001/health` | AI service health check | Any | Yes | **Yes** | `{"status":"ok"}` |
| `npm run load:qa` | QA data loader dry-run validation | `Mega_Project-main/backend2` | Yes | **Yes** | Dry run complete: 0 writes, 0 errors |
| `npm test` | Run frontend component/unit tests | `Mega_Project-main/frontend` | Yes | **Yes** | 137 passed in 1.5s |
| `npm run lint` | Frontend Oxlint code inspection | `Mega_Project-main/frontend` | Yes | **Yes** | 0 errors |
| `npm run build` | Frontend production bundle build | `Mega_Project-main/frontend` | Yes | **Yes** | Built in 306ms |
| `node --test tests/aiService.client.test.js` | Backend AI client unit test | `Mega_Project-main/backend2` | Yes | **Yes** | 9 passed in 168ms |
| `node --test tests/translation.service.test.js` | Backend translation unit test | `Mega_Project-main/backend2` | Yes | **Yes** | 8 passed in 127ms |
| `.venv/bin/pytest` | AI service comprehensive test suite | `Mega_Project-main/ai-service` | Yes | **Yes** | 613 passed in 21.6s |
| `node scripts/load-manual-qa-data.mjs --apply` | Commit QA dataset to DB | `Mega_Project-main/backend2` | Yes | *Skipped by Safety Spec* | Ready for execution when requested |

---

## Minimum Commands for Tomorrow

To start working on LokRozgar AI tomorrow morning, open your terminal and run these exact commands:

### Terminal 1: Backend
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/backend2
npm run dev
```

### Terminal 2: Frontend
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/frontend
npm run dev
```

### Terminal 3: AI Service (Optional, for voice & matching features)
```bash
cd /Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/ai-service
.venv/bin/uvicorn app.main:app --port 8001 --reload
```

Once running, access the web application at **[http://localhost:5173](http://localhost:5173)**.

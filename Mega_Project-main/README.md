# LokRozgar AI (लोक रोजगार)

> Vernacular, voice-enabled employment platform designed for blue-collar workers and local employers across Maharashtra, India.

---

## 1. Overview & Architecture

LokRozgar AI bridges the digital divide for skilled and semi-skilled tradespeople (plumbers, electricians, construction workers, drivers, domestic helpers, carpenters, and technicians) through:

- **Multilingual Vernacular Support**: Full i18n support in **Marathi (मराठी)**, **Hindi (हिंदी)**, and **English**, complete with speech synthesis and voice-guided assistance.
- **Voice-First Profile Creation & Interaction**: Direct speech-to-text extraction for worker skills and employer business profiles.
- **Skill-First Geospatial Matching**: Intelligent recommendation engine matching workers and jobs by trade skills, MongoDB `2dsphere` geographic proximity, availability, pay expectations, and reputation ratings.
- **Two-Way Verified Reviews**: Post-engagement feedback mechanisms between workers and employers.
- **Real-Time Communication**: In-app notifications and messaging.

### Architecture Diagram

```
┌────────────────────────────────────────────────────────┐
│               Frontend Client (Port 5173)              │
│       React 18 + Vite + Tailwind CSS + Lucide Icons     │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
                │ REST / WebSocket       │ Direct AI calls /
                │ (Port 8000)            │ Voice transcription
                ▼                        ▼
┌─────────────────────────────────┐   ┌──────────────────────────────┐
│     Backend API (Port 8000)     │   │    AI Service (Port 8001)    │
│  Node.js + Express + Mongoose   │◄─►│   FastAPI + Uvicorn + Python │
│  JWT Auth + Rate Limiting       │   │  NLP, Translation & Ranking  │
└───────────────┬─────────────────┘   └──────────────────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│     MongoDB (Port 27017)        │
│  2dsphere Geospatial Indexing   │
└─────────────────────────────────┘
```

---

## 2. Directory Structure

```
Mega_Project-main/
├── README.md                      # This document (Architecture & Quickstart)
├── frontend/                      # React 18 + Vite client (Port 5173)
│   ├── src/                       # Components, Pages, Context, Hooks, Translations
│   ├── tests/                     # Unit and integration test suite
│   ├── package.json
│   └── vite.config.js
├── backend2/                      # Node.js + Express backend (Port 8000)
│   ├── config/                    # Database, JWT, and CORS configs
│   ├── controllers/               # Route handlers (auth, jobs, workers, reviews, etc.)
│   ├── models/                    # Mongoose schemas (User, Job, Worker, Review, etc.)
│   ├── routes/                    # API endpoints (/api/v1/...)
│   ├── scripts/                   # Migration and QA data loading scripts
│   ├── tests/                     # Node test runner suite
│   ├── docs/                      # Backend module & API documentation
│   └── package.json
├── ai-service/                    # Python FastAPI AI microservice (Port 8001)
│   ├── app/                       # FastAPI application, routers, models, services
│   ├── tests/                     # Pytest suite
│   ├── requirements.txt
│   └── .venv/                     # Dedicated Python virtual environment
├── manual-qa-data/                # Authoritative synthetic QA test fixtures
│   ├── workers.json / .csv        # 40 diverse worker profiles
│   ├── employers.json / .csv      # 15 employer profiles
│   ├── jobs.json / .csv           # 50 categorized jobs
│   ├── applications.json / .csv   # Sample job application workflows
│   ├── matching_pairs.json / .csv # Verification pairs for recommendation algorithms
│   ├── fraud_scenarios.json / .csv# Fraud detection test cases
│   ├── reports.json / .csv        # Dispute and report samples
│   └── negative_test_cases.json   # Input validation negative tests
└── docs/                          # Consolidated Project Documentation
    ├── PROJECT_STARTUP_GUIDE.md   # Canonical environment setup & startup guide
    ├── architecture.md            # In-depth architectural blueprint & specifications
    └── qa/                        # QA documentation and testing manuals
        ├── README.md              # QA directory index
        └── MANUAL_QA_DATA_GUIDE.md# Detailed synthetic profile and load instructions
```

---

## 3. Quickstart & Service Startup

For step-by-step installation instructions, environment variable setup, and database initialization, refer to the [Project Startup Guide](file:///Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/docs/PROJECT_STARTUP_GUIDE.md).

### Prerequisites
- Node.js (v18+) & npm
- Python 3.10+
- MongoDB running locally on `localhost:27017`

### Running the Services

| Service | Port | Directory | Start Command |
|---|---|---|---|
| **Backend API** | `8000` | `Mega_Project-main/backend2` | `npm run dev` |
| **AI Service** | `8001` | `Mega_Project-main/ai-service` | `.venv/bin/uvicorn app.main:app --port 8001` |
| **Frontend** | `5173` | `Mega_Project-main/frontend` | `npm run dev` |

---

## 4. Testing & QA Protocols

### Running Frontend Tests
```bash
cd frontend
npm test             # Run Vitest / test runner (143 passing unit & integration tests)
npm run build        # Verify production Vite build
```

### Running Backend Tests
```bash
cd backend2
node --test tests/aiService.client.test.js
node --test tests/translation.service.test.js
```

### Running AI Service Tests
```bash
cd ai-service
.venv/bin/pytest tests/   # 613 passing tests
```

### QA Fixture Dry-Run Verification
To verify data fixtures against Mongoose schemas without mutating databases:
```bash
cd backend2
npm run load:qa          # Dry-run validation of manual-qa-data
```

> **Safety Notice**: Production database is `LokRozgar_AI`. Isolated test database is `LokRozgar_AI_Manual_QA`. Never run `npm run load:qa -- --apply` against production.

---

## 5. Documentation Links

- [Project Startup Guide](file:///Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/docs/PROJECT_STARTUP_GUIDE.md)
- [System Architecture & Specifications](file:///Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/docs/architecture.md)
- [QA & Fixtures Guide](file:///Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/docs/qa/MANUAL_QA_DATA_GUIDE.md)
- [Backend API Documentation](file:///Users/swaruppal/Desktop/Lokrojgar/Mega_Project-main/backend2/docs/API_DOCUMENTATION.md)

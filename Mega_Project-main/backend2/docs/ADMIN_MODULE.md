# LokRozgar AI - Production Admin Panel Module Documentation

## 1. Overview & Architecture

The **LokRozgar AI Admin Panel** is a production-grade, secure, multilingual administrative system built specifically for the LokRozgar AI employment platform. It empowers administrators to manage workers, verify employers, moderate jobs, audit ratings, resolve user disputes, broadcast multilingual announcements, monitor AI microservice health, and inspect immutable audit logs.

```
┌────────────────────────────────────────────────────────┐
│               Frontend (React 18 + Vite)               │
│  - /admin/login (Dedicated admin access portal)        │
│  - /admin/* (Protected by role check & token guard)    │
│  - AdminLayout (Sidebar, Topbar, Language Switcher)    │
│  - 10 Administrative Functional Modules                │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / JSON (Bearer JWT)
┌───────────────────────────▼────────────────────────────┐
│         Main Backend (Express 4.x + Mongoose)          │
│  - Route: /api/v1/admin/*                              │
│  - Middleware: verifyJWT + authorizeRoles("admin")     │
│  - Controller: src/controllers/admin.controller.js     │
│  - Models: User, WorkerProfile, EmployerProfile, Job,  │
│    Application, Dispute, Rating, Notification,         │
│    AdminAction (Audit Logs)                            │
└─────────────┬────────────────────────────┬─────────────┘
              │ MongoDB Native Driver      │ HTTP GET /health
              ▼                            ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│      MongoDB Database    │  │   FastAPI AI Service     │
│  - Real aggregations     │  │  - GET /health           │
│  - Compound indexes      │  │  - Latency measurement   │
│  - Referential integrity │  │  - Redacted telemetry    │
└──────────────────────────┘  └──────────────────────────┘
```

---

## 2. Admin Authentication & Authorization

### Zero Public Registration
Public self-registration for administrators is strictly forbidden. The system does not expose any admin registration endpoint.

### Role Enforcement & Server-Side Middleware
- Every request to `/api/v1/admin/*` must pass through:
  1. `verifyJWT`: Validates HTTP-only cookie or `Authorization: Bearer <token>`.
  2. `authorizeRoles("admin")`: Rejects any user whose `roles` array does not include `"admin"` with `403 Forbidden`.
  3. Suspended check: Ensures the requesting administrator account is active (`isBlocked: false`).

### Safe First-Admin Creation Utility
A dedicated CLI script is provided at `backend2/scripts/create-admin.mjs`.

```bash
# Using CLI parameters
node scripts/create-admin.mjs --phone 9876543210 --password "AdminSecurePass#2026" --name "Super Administrator"

# OR using environment variables
ADMIN_PHONE="9876543210" ADMIN_PASSWORD="AdminSecurePass#2026" ADMIN_NAME="Super Administrator" node scripts/create-admin.mjs
```

Features:
- Validates 10-digit Indian phone numbers (`^[6-9]\d{9}$`).
- Enforces strong passwords (minimum 8 characters).
- Hashes passwords using bcrypt (`saltRounds = 10`).
- Upserts the admin role safely without overwriting other roles if the account already exists.
- Never prints passwords to logs or terminals.

---

## 3. Database Changes & Indexing

### 3.1 Model Enhancements
1. **`Rating` Model (`src/models/rating.model.js`)**:
   - `isModerated`: Boolean flag indicating admin review.
   - `moderatedAt`: Timestamp of moderation action.
   - `moderatedByAdminId`: Reference to `User._id` of the admin.
   - `moderationReason`: Documented rationale for audit trail.

2. **`Notification` Model (`src/models/notification.model.js`)**:
   - Multilingual announcements use canonical `type: "system"` with metadata `{ announcement: true, targetRole, sentByAdminId }`.
   - Supports localized content across `title.{en,mr,hi}` and `body.{en,mr,hi}`.

3. **`AdminAction` Model (`src/models/adminAction.model.js`)**:
   - Compound indexes added for bounded, fast audit log queries:
     - `{ createdAt: -1 }`
     - `{ actionType: 1, createdAt: -1 }`
     - `{ adminId: 1, createdAt: -1 }`
     - `{ targetUserId: 1, createdAt: -1 }`

---

## 4. API Endpoints Specification

All endpoints are mounted under `/api/v1/admin` and require `Authorization: Bearer <token>` with `role: "admin"`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/dashboard/stats` | Real MongoDB aggregations: worker/employer totals, active jobs, disputes, monthly trends |
| `GET` | `/workers` | Searchable, paginated list of workers with filters (`status`, `availability`, `city`) |
| `GET` | `/workers/:id` | Full worker profile, skills, verified status, and recent application history |
| `PATCH` | `/workers/:id/status` | Suspend or reactivate worker account (`isBlocked`, `reason`) |
| `GET` | `/employers` | Searchable, paginated list of employers with filters (`status`, `isVerified`, `city`) |
| `GET` | `/employers/:id` | Detailed employer profile, company details, job posting and hiring history |
| `PATCH` | `/employers/:id/verify` | Approve or revoke employer business verification (`isVerified`, `reason`) |
| `PATCH` | `/employers/:id/status` | Suspend or reactivate employer account (`isBlocked`, `reason`) |
| `GET` | `/jobs` | Paginated job postings with filters (`status`, `payType`, `search`) |
| `GET` | `/jobs/:id` | Detailed job posting, employer metadata, applicants, and linked disputes |
| `PATCH` | `/jobs/:id/moderate` | Admin moderation action (`cancel`, `reopen`, `close`, `reason`) |
| `GET` | `/applications` | Read-only administrative overview of candidate applications and AI match scores |
| `GET` | `/applications/:id` | Detailed application metadata, match factors breakdown, and cover notes |
| `GET` | `/disputes` | Dispute and complaint management with filters (`status`, `search`) |
| `GET` | `/disputes/:id` | Full dispute case file, complainant/defendant details, evidence files |
| `PATCH` | `/disputes/:id/status` | Update dispute status (`open`, `under_review`, `resolved`, `dismissed`, `resolutionNote`) |
| `GET` | `/ratings` | Audit reviews and ratings with filters (`minScore`, `maxScore`, `isModerated`) |
| `PATCH` | `/ratings/:id/moderate` | Moderate reviews (`isModerated`, `moderationReason`, `redactReviewText`) |
| `POST` | `/announcements` | Broadcast targeted multilingual notifications (`workers`, `employers`, `all`) |
| `GET` | `/ai-monitoring/status` | Live health check against FastAPI AI microservice with roundtrip latency |
| `GET` | `/audit-logs` | Immutable audit trail of administrative decisions with bounded pagination |

---

## 5. Frontend Admin Module

### Design System & Layout
- **Path**: `frontend/src/components/admin/AdminLayout.jsx`
- Follows LokRozgar AI tokens (`var(--color-primary)`, `var(--color-surface)`, `var(--color-text)`, glassmorphism, responsive drawer).
- Persistent sidebar on desktop (`> 1024px`), accessible touch drawer on tablet/mobile.
- Topbar with active page breadcrumb, multilingual language switcher, admin profile pill, and secure logout.

### Reusable Admin Components
- `AdminStatCard`: Metric cards with trend indicators and status colors.
- `AdminBadge`: Color-coded status badges for active, suspended, verified, unverified, completed.
- `AdminTable`: Accessible, sortable tables with loading skeletons and empty states.
- `AdminPagination`: Accessible pagination controls with page indicators.
- `AdminModal`: Accessible dialogs with escape key listeners and backdrop focus trap.
- `AdminConfirmDialog`: Dangerous action confirmation with required reason input.

### Multilingual Support (i18n)
All 10 administrative pages are 100% localized across:
- **English (`en.js`)**: 110+ admin keys.
- **Marathi (`mr.js`)**: Authentic Devanagari Marathi strings.
- **Hindi (`hi.js`)**: Authentic Devanagari Hindi strings.
- Strictly verified by automated linting and regex checks ensuring no raw English is leaked in Hindi or Marathi.

---

## 6. AI Service Monitoring Integration

### FastAPI Integration
- Added GET `/health` endpoint to `ai-service/app/main.py`.
- Returns `{ "status": "operational", "service": "lokrozgar-ai-service", "version": "1.0.0", "capabilities": [...] }`.
- Backend client `aiService.client.js` executes `getAiServiceHealth(timeoutMs = 5000)` measuring exact millisecond roundtrip latency.

### Privacy & Transparency Guarantees
- Audio recordings, transcripts, user credentials, and external API keys are strictly redacted.
- Offline evaluation metrics are displayed transparently as "Not measured" rather than inventing fake percentages.

---

## 7. Audit Logging Specification

Every moderation and administrative state change generates an immutable `AdminAction` record:
- `adminId`: Admin's User ID.
- `actionType`: `SUSPEND_USER`, `REACTIVATE_USER`, `VERIFY_EMPLOYER`, `REJECT_EMPLOYER_VERIFICATION`, `MODERATE_JOB`, `RESOLVE_DISPUTE`, `MODERATE_RATING`, `SEND_ANNOUNCEMENT`.
- `targetUserId`: Identifier of the affected worker or employer.
- `details`: Human-readable explanation including the provided reason.
- `metadata`: Sanitized before/after snapshot (passwords, tokens, and personal secrets are strictly filtered out).
- `createdAt`: ISO timestamp.

---

## 8. Verification & Test Results

### 8.1 Backend Test Results
```bash
node --test tests/admin.module.test.js tests/auth.controller.test.js tests/rating.controller.test.js tests/notificationTypes.test.js tests/jobModule.security.test.js
```
- **Tests**: 67 passed, 0 failed.
- **Full Backend Suite**: 516 passed, 0 failed.

### 8.2 Frontend Test Results
```bash
npm test
```
- **Tests**: 137 passed, 0 failed.
- `translationKeys.test.mjs`: Verified 100% parity across English, Marathi, and Hindi.
- `routeLinks.test.mjs`: Verified all internal admin links resolve to valid registered routes.

### 8.3 Frontend Production Build
```bash
npm run build
```
- Vite production bundle compiled cleanly in 277ms with 0 syntax or bundle errors.

---

## 9. How to Run Locally

### 1. Start MongoDB
Ensure MongoDB is running locally on port 27017 or provide `MONGODB_URI` in `backend2/.env`.

### 2. Create the Administrator
```bash
cd backend2
node scripts/create-admin.mjs --phone 9876543210 --password "AdminPass@2026" --name "Lead Administrator"
```

### 3. Start Backend
```bash
cd backend2
npm run dev
# Server running on http://localhost:8000
```

### 4. Start AI Service (Optional for Telemetry)
```bash
cd ai-service
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 5. Start Frontend
```bash
cd frontend
npm run dev
# Vite client running on http://localhost:5173
```

### 6. Access Admin Portal
1. Open `http://localhost:5173/admin/login` in your browser.
2. Sign in using the registered admin phone (`9876543210`) and password (`AdminPass@2026`).
3. You will be redirected to `http://localhost:5173/admin` with full administrative privileges.

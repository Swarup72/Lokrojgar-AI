# LokRozgar_AI Backend API Documentation (v1)

Base URL: `http://localhost:8000/api/v1`

---

## 1. Authentication Module (`/auth`)

| Endpoint | Method | Access | Description |
| :--- | :--- | :--- | :--- |
| `/auth/send-otp` | `POST` | Public | Send OTP to phone number |
| `/auth/verify-otp` | `POST` | Public | Verify phone OTP |
| `/auth/register` | `POST` | Public | Register new user (worker or employer) |
| `/auth/login` | `POST` | Public | Login with phone & password |
| `/auth/logout` | `POST` | Authenticated | Logout user session |
| `/auth/refresh-token` | `POST` | Public | Refresh JWT access token |
| `/auth/change-password` | `POST` | Authenticated | Change current user password |
| `/auth/reset-password` | `POST` | Public | Reset password with OTP verification |
| `/auth/sessions` | `GET` | Authenticated | List active user sessions |
| `/auth/sessions/:sessionId/revoke` | `POST` | Authenticated | Revoke specific session |
| `/auth/add-role` | `POST` | Authenticated | Add additional role (worker/employer) |

---

## 2. User Module (`/users`)

| Endpoint | Method | Access | Description |
| :--- | :--- | :--- | :--- |
| `/users/me` | `GET` | Authenticated | Fetch current user & profile details |
| `/users/language` | `PATCH` | Authenticated | Update preferred language ('mr', 'hi', 'en') |
| `/users/account` | `DELETE` | Authenticated | Delete user account & associated profile data |
| `/users/device-token` | `POST` | Authenticated | Register FCM device token for push notifications |

---

## 3. Worker Profile Module (`/worker-profile`)

| Endpoint | Method | Access | Description |
| :--- | :--- | :--- | :--- |
| `/worker-profile/me` | `GET` | Worker/Admin | Fetch worker profile |
| `/worker-profile` | `POST` | Worker/Admin | Create or update worker profile details |
| `/worker-profile/availability` | `PATCH` | Worker/Admin | Toggle availability ('available', 'busy', 'unavailable') |
| `/worker-profile/location` | `PATCH` | Worker/Admin | Update worker location [longitude, latitude] |
| `/worker-profile/radius` | `PATCH` | Worker/Admin | Update preferred work radius in km |
| `/worker-profile/categories` | `PATCH` | Worker/Admin | Update preferred job category IDs |
| `/worker-profile/photo` | `POST` | Worker/Admin | Upload profile photo to Cloudinary |

---

## 4. Employer Profile Module (`/employer-profile`)

| Endpoint | Method | Access | Description |
| :--- | :--- | :--- | :--- |
| `/employer-profile/me` | `GET` | Employer/Admin | Fetch employer profile |
| `/employer-profile` | `POST` | Employer/Admin | Create or update employer profile details |
| `/employer-profile/photo` | `POST` | Employer/Admin | Upload business photo to Cloudinary |
| `/employer-profile/business` | `PATCH` | Employer/Admin | Update business details |

---

## 5. Catalog Module (`/catalog`)

| Endpoint | Method | Access | Description |
| :--- | :--- | :--- | :--- |
| `/catalog/categories` | `GET` | Public | List categories with language resolution (`?lang=mr/hi/en`) |
| `/catalog/skills` | `GET` | Public | List skills with language resolution |
| `/catalog/categories` | `POST` | Admin | Create job category |
| `/catalog/categories/:categoryId` | `PATCH` | Admin | Update job category |
| `/catalog/categories/:categoryId` | `DELETE` | Admin | Deactivate job category |
| `/catalog/skills` | `POST` | Admin | Create skill |
| `/catalog/skills/:skillId` | `PATCH` | Admin | Update skill |
| `/catalog/skills/:skillId` | `DELETE` | Admin | Deactivate skill |

---

## 6. Job Module (`/jobs`)

| Endpoint | Method | Access | Description |
| :--- | :--- | :--- | :--- |
| `/jobs/search` | `GET` | Public | Search & filter jobs with pagination & language picker |
| `/jobs/nearby` | `GET` | Public | Fetch nearby jobs using `$geoNear` |
| `/jobs/recommended` | `GET` | Worker | Fetch AI-recommended jobs for worker (Worker → Jobs) |
| `/jobs/:jobId/recommended-workers` | `GET` | Employer/Admin | Fetch AI-recommended workers for a job (Job → Workers) |
| `/jobs` | `POST` | Employer/Admin | Create job with auto-translation |
| `/jobs/employer/mine` | `GET` | Employer/Admin | List employer's posted jobs |
| `/jobs/:jobId` | `PATCH` | Employer/Admin | Update job details |
| `/jobs/:jobId/cancel` | `POST` | Employer/Admin | Cancel job |
| `/jobs/:jobId/close` | `POST` | Employer/Admin | Mark job completed and closed |

`/jobs/recommended` and `/jobs/:jobId/recommended-workers` both call the
Python AI service (`../ai-service`) via `services/aiService.client.js` —
Node does not compute match scores itself. `/jobs/recommended` response:
`[{ job, matchScore, matchFactors }]`, sorted by `matchScore` descending.
`/jobs/:jobId/recommended-workers` response: `[{ worker, matchScore,
matchFactors }]`, same ordering. `matchFactors.pay`/`.rating` may be
`null` (not comparable/not yet rated) rather than `0` — see the AI
service's README for why. Both return `503` if the AI service is
unreachable, or the AI service's own status code if it rejects the
request (e.g. `400` for an invalid `top_k`) — never a fabricated score.

---

## 7. Application Module (`/applications`)

| Endpoint | Method | Access | Description |
| :--- | :--- | :--- | :--- |
| `/applications/apply` | `POST` | Worker | Apply for job (scores via the AI service, requires `status: "open"`) |
| `/applications/:applicationId/withdraw` | `POST` | Worker | Withdraw application |
| `/applications/mine` | `GET` | Worker | List worker's applications |
| `/applications/job/:jobId` | `GET` | Employer/Admin | List applicants for job ranked by score |
| `/applications/:applicationId/shortlist` | `PATCH` | Employer/Admin | Shortlist application |
| `/applications/:applicationId/status` | `PATCH` | Employer/Admin | Accept/reject application (increments filled count) |

`/applications/apply` calls the AI service's `/recommendations/score-pair`
via `scoreWorkerJobPair()` and persists both `matchScore` and
`matchFactors` on the created `Application` (previously `matchFactors` was
computed but not saved - fixed as part of the AI cutover). Only jobs with
`status: "open"` accept new applications — a `partially_assigned` job may
still appear in `/jobs/recommended` if it needs more workers, but cannot
receive a *new* application through this endpoint; this is an intentional
difference between recommendation visibility and application eligibility,
not an oversight. If the AI service is unreachable, no `Application` is
created and the request fails with `503` rather than falling back to a
fabricated score.

**Legacy matching engine**: `services/matching.service.js`
(`calculateMatchScore`) is no longer used by any production route. It
remains in the repository for reference and is still covered by its own
unit test in `tests/api.test.js`, pending an explicit decision to remove
it.

---

## 8. Saved Jobs (`/saved-jobs`), Offers (`/offers`), Shifts (`/shifts`), Payments (`/payments`), Ratings (`/ratings`), Disputes (`/disputes`), Chat (`/chat`), Notifications (`/notifications`), & Admin (`/admin`)

For full endpoint definitions, request/response payload examples, and Socket.io event lists, refer to the source codebase and schema files.

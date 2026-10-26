# LokRozgar AI - Reliable Notification System Architecture

## 1. System Overview

The LokRozgar AI Notification System provides a high-reliability, trilingual (Marathi, Hindi, English), multi-channel messaging infrastructure designed specifically for blue-collar workers, employers, and platform administrators.

### Core Design Principles
1. **Never Break the Caller:** Failed notification deliveries (e.g. downstream SMS provider down or missing API keys) are caught and isolated; they never fail an underlying business operation (such as applying for a job, paying a worker, or resolving a dispute).
2. **Strict Idempotency:** Duplicate events and retried HTTP requests are deduplicated using unique idempotency keys and sparse MongoDB indexes.
3. **Trilingual from the Ground Up:** All system events generate message content simultaneously in Marathi (`mr`), Hindi (`hi`), and English (`en`), with recipient preference resolution and seamless English fallback.
4. **Channel Provider Abstraction:** A unified provider interface supports In-App, FCM Push, SMS (Msg91/Twilio), WhatsApp Cloud API, and Email (SMTP/SendGrid). Unconfigured channels return explicit `skipped` statuses rather than failing or falsely claiming delivery.
5. **Security & Privacy Scoping:** Notifications are strictly scoped to the authenticated recipient (`userId: req.user._id`). External credentials, tokens, and personally identifiable information (PII) are sanitized and never logged.

---

## 2. Notification Model & Schema

Located in `backend2/src/models/notification.model.js`:

```javascript
{
  userId: { type: ObjectId, ref: "User", required: true, index: true },
  type: {
    type: String,
    enum: ["job_alert", "application_update", "payment_update", "system", "dispute", "chat"],
    required: true,
  },
  channel: {
    type: String,
    enum: ["in_app", "push", "sms", "whatsapp", "email"],
    default: "in_app",
  },
  deliveryStatus: {
    type: String,
    enum: ["pending", "delivered", "failed", "skipped"],
    default: "delivered",
  },
  title: {
    mr: { type: String, default: "" },
    hi: { type: String, default: "" },
    en: { type: String, default: "" },
  },
  body: {
    mr: { type: String, default: "" },
    hi: { type: String, default: "" },
    en: { type: String, default: "" },
  },
  isRead: { type: Boolean, default: false, index: true },
  readAt: { type: Date, default: null },
  refId: { type: ObjectId, default: null },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  attempts: { type: Number, default: 1 },
  idempotencyKey: { type: String, default: null, sparse: true, index: true },
  externalId: { type: String, default: null },
  errorMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
```

---

## 3. Provider Abstraction & Bounded Retries

Located in `backend2/src/services/notificationProviders/notificationProvider.js`:

### Provider Architecture
- `BaseNotificationProvider`: Base class defining `isConfigured()`, `send(params)`, and sanitization helpers.
- `InAppNotificationProvider`: Persists to MongoDB with immediate `delivered` status for authenticated inbox consumption.
- `PushNotificationProvider`: Integrates with Firebase Cloud Messaging (FCM) using multicasts.
- `SmsNotificationProvider`: Msg91 / Twilio SMS gateway abstraction.
- `WhatsAppNotificationProvider`: WhatsApp Cloud API template message abstraction.
- `EmailNotificationProvider`: SMTP / SendGrid transactional email abstraction.

### Bounded Retries with Sanitized Errors
External channel deliveries use `executeWithRetry(asyncFn, options)`:
- Maximum retries: 2 (3 attempts total).
- Exponential backoff: `baseDelayMs * 2^(attempt - 1)`.
- Secret Redaction: High-entropy tokens, API keys, and bearer tokens are automatically replaced with `[REDACTED]` before logging or persisting in `errorMetadata`.
- Unconfigured Handling: When environment variables are absent, providers return `{ status: "skipped", error: "Provider not configured" }`.

---

## 4. Trilingual Event Templates

Located in `backend2/src/utils/notificationBuilder.js`:

Supported Template Keys:
- `JOB_ALERT`: Alerts nearby workers when a new matching job is posted.
- `APPLICATION_SUBMITTED`: Alerts employers of a new worker applicant.
- `APPLICATION_ACCEPTED`: Alerts worker that employer accepted their application.
- `APPLICATION_REJECTED`: Alerts worker if not selected.
- `APPLICATION_COMPLETED`: Alerts worker when work is marked completed.
- `PAYMENT_RECEIVED`: Alerts payee upon cash/UPI recording or Razorpay verification.
- `DISPUTE_RAISED`: Alerts opposing party when a dispute is opened.
- `DISPUTE_STATUS_UPDATED`: Alerts parties on administrative dispute updates.
- `DISPUTE_RESOLVED`: Alerts parties upon dispute settlement.
- `SYSTEM_ANNOUNCEMENT`: Platform broadcast announcements.
- `NEW_MESSAGE`: Real-time chat messages and notifications.

---

## 5. REST API Reference

All routes are authenticated via `verifyJWT`.

### 1. Get Notification Inbox
- **Endpoint:** `GET /api/v1/notifications`
- **Query Parameters:**
  - `page` (default: 1)
  - `limit` (default: 20, max: 50)
  - `isRead` (optional boolean filter)
  - `type` (optional enum filter: `job_alert`, `application_update`, `payment_update`, `system`, `dispute`, `chat`)
- **Response:**
```json
{
  "statusCode": 200,
  "data": {
    "notifications": [
      {
        "_id": "67...a1",
        "type": "job_alert",
        "title": "नवीन काम उपलब्ध: Electrician",
        "body": "तुमच्या भागात ₹800 प्रति दिवस ची नोकरी उपलब्ध आहे.",
        "rawTitle": { "mr": "...", "hi": "...", "en": "..." },
        "rawBody": { "mr": "...", "hi": "...", "en": "..." },
        "channel": "in_app",
        "deliveryStatus": "delivered",
        "isRead": false,
        "readAt": null,
        "refId": "67...b2",
        "createdAt": "2026-10-26T18:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3,
      "hasMore": true
    },
    "unreadCount": 7
  },
  "message": "Notifications retrieved"
}
```

### 2. Get Unread Count
- **Endpoint:** `GET /api/v1/notifications/unread-count`
- **Response:**
```json
{
  "statusCode": 200,
  "data": { "unreadCount": 7 },
  "message": "Unread notification count"
}
```

### 3. Mark Single Notification Read
- **Endpoint:** `PATCH /api/v1/notifications/:id/read`
- **Security:** Validates ObjectId format (400 if invalid). Requires both `_id` and `userId: req.user._id` (404 if not found or unauthorized).
- **Response:**
```json
{
  "statusCode": 200,
  "data": { "_id": "67...a1", "isRead": true, "readAt": "2026-10-26T18:30:00.000Z" },
  "message": "Notification marked as read"
}
```

### 4. Mark All Notifications Read
- **Endpoint:** `PATCH /api/v1/notifications/read-all`
- **Response:**
```json
{
  "statusCode": 200,
  "data": { "modifiedCount": 7 },
  "message": "All notifications marked as read"
}
```

### 5. Administrator Platform Broadcast
- **Endpoint:** `POST /api/v1/admin/announcements`
- **Role:** Administrator only (`roles.includes("admin")`)
- **Payload:**
```json
{
  "targetRole": "all",
  "title": {
    "en": "Platform System Maintenance",
    "mr": "प्लॅटफॉर्म प्रणाली देखभाल",
    "hi": "प्लेटफ़ॉर्म सिस्टम रखरखाव"
  },
  "body": {
    "en": "Scheduled maintenance from 11 PM to 1 AM.",
    "mr": "रात्री ११ ते १ या वेळेत देखभाल होणार आहे.",
    "hi": "रात 11 बजे से 1 बजे तक रखरखाव निर्धारित है।"
  },
  "channels": ["in_app", "sms"]
}
```
- **Response:**
```json
{
  "statusCode": 201,
  "data": {
    "sentCount": 1420,
    "inAppDelivered": 1420,
    "deliveryStats": {
      "totalTargeted": 1420,
      "delivered": 1420,
      "skipped": 0,
      "failed": 0,
      "channel": "in_app"
    },
    "deliveryReport": {
      "in_app": { "status": "delivered", "count": 1420 },
      "sms": { "status": "unavailable", "note": "Provider for sms is not configured (missing environment credentials)." }
    }
  },
  "message": "Announcement successfully broadcast to 1420 users"
}
```

---

## 6. Frontend Integration

1. **Notification Inbox (`/notifications`):**
   - Filter tabs: All, Unread, Job Alerts, Applications, Disputes, Platform Announcements.
   - Live unread counters, mark as read, mark all read, relative timestamps, and direct deep-linking to related entities (`/jobs/:id`, `/applications`, `/messages`).
   - Loading skeletons, empty state, and responsive pagination controls.
2. **Navbar Bell Icon:**
   - Real-time unread badge counter in desktop navigation bar and mobile drawer.
   - Auto-refreshes periodically and updates on route changes.
3. **Multilingual Consistency:**
   - Fully translated across English, Marathi, and Hindi using genuine Devanagari text.

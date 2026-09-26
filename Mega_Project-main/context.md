# Project Context: Local Language Job Portal (Blue-Collar Workers)

## Overview
A React Native + MERN mobile platform connecting blue-collar workers (plumbers, electricians, drivers, maids, carpenters) with local employers, using **voice-first profile creation** in Marathi/Hindi and **geospatial job matching**.

- **Domain**: Mobile application, React Native + MERN
- **Relevance**: Maharashtra-focused, Digital India fit, free to deploy, high social impact
- **Core differentiators**:
  - Voice-first profile creation (no typing required) — not commonly done for Indian vernacular languages
  - i18n: Marathi + Hindi + English toggle
  - Geospatial matching via MongoDB `2dsphere` index + `$near` operator
  - Solves a real, visible local problem (Sangli/Maharashtra)

## User Roles
| Role | Capabilities |
|---|---|
| **Worker** | Voice profile creation, set skills/availability/location, apply to jobs, chat with employers, collect ratings |
| **Employer** | Post jobs, browse matched workers, send offers, rate workers after job completion |
| **Admin** | Web dashboard — manage users, resolve disputes, view analytics, verify skill badges |

## Key Features
- Voice input for profile creation (Marathi/Hindi) — no typing needed
- Location-based job posting (skill, pay type: daily/monthly)
- AI-style matching engine: ranks workers by proximity, skill match, availability, rating
- In-app real-time chat (Socket.io) between worker and employer
- Skill badge system, verified via completed jobs + ratings
- Full UI localization: Marathi, Hindi, English (switchable anytime)

---

## Recommended Build Order
1. **Auth** (login/register, JWT)
2. **Worker profile** (incl. voice)
3. **Job posting**
4. **Geospatial match engine** ← core differentiator, build/demo-ready first
5. **Chat** (Socket.io)
6. **Voice** (record + transcribe)
7. **i18n** (Marathi/Hindi/English)

---

## Folder Structure

### Backend (Node / Express)
```
job-portal/
├── backend/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── workerController.js
│   │   ├── employerController.js
│   │   ├── jobController.js
│   │   ├── matchController.js
│   │   ├── chatController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── roleMiddleware.js
│   │   └── errorHandler.js
│   ├── models/
│   │   ├── User.js
│   │   ├── WorkerProfile.js
│   │   ├── EmployerProfile.js
│   │   ├── Job.js
│   │   ├── Application.js
│   │   ├── Chat.js
│   │   └── Review.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── workers.js
│   │   ├── employers.js
│   │   ├── jobs.js
│   │   ├── match.js
│   │   ├── chat.js
│   │   └── admin.js
│   ├── utils/
│   │   ├── matchEngine.js
│   │   └── voiceTranscribe.js
│   ├── uploads/          ← profile photos (Cloudinary)
│   ├── .env
│   └── server.js
```

### Mobile (React Native / Expo)
```
├── mobile/
│   ├── assets/
│   ├── src/
│   │   ├── api/
│   │   │   └── axios.js
│   │   ├── components/
│   │   │   ├── VoiceRecorder.jsx
│   │   │   ├── JobCard.jsx
│   │   │   ├── WorkerCard.jsx
│   │   │   ├── ChatBubble.jsx
│   │   │   ├── SkillBadge.jsx
│   │   │   ├── RatingStars.jsx
│   │   │   ├── MapView.jsx
│   │   │   └── LanguageToggle.jsx
│   │   ├── screens/
│   │   │   ├── auth/
│   │   │   │   ├── LoginScreen.jsx
│   │   │   │   └── RegisterScreen.jsx
│   │   │   ├── worker/
│   │   │   │   ├── WorkerHome.jsx
│   │   │   │   ├── VoiceProfile.jsx
│   │   │   │   ├── JobList.jsx
│   │   │   │   └── MyApplications.jsx
│   │   │   ├── employer/
│   │   │   │   ├── EmployerHome.jsx
│   │   │   │   ├── PostJob.jsx
│   │   │   │   ├── MatchedWorkers.jsx
│   │   │   │   └── ManageJobs.jsx
│   │   │   └── shared/
│   │   │       ├── ChatScreen.jsx
│   │   │       ├── ProfileScreen.jsx
│   │   │       └── SettingsScreen.jsx
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   └── LanguageContext.jsx
│   │   ├── i18n/
│   │   │   ├── en.js
│   │   │   ├── hi.js
│   │   │   └── mr.js        ← Marathi strings
│   │   ├── navigation/
│   │   │   ├── AppNavigator.jsx
│   │   │   └── TabNavigator.jsx
│   │   └── utils/
│   │       └── locationHelper.js
│   └── App.jsx
├── admin-web/             ← React web admin panel
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── Users.jsx
│       │   └── Analytics.jsx
│       └── App.jsx
```

---

## MongoDB Schemas

### `WorkerProfile.js` (geospatial-enabled)
```js
{
  userId: { type: ObjectId, ref: 'User' },
  skills: [{ type: String }], // e.g. ['plumber','electrician','painter']
  experience: Number,         // years
  dailyRate: Number,          // in INR
  availability: {
    type: String,
    enum: ['available','busy','unavailable']
  },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number],  // [longitude, latitude]
    address: String,        // "Sangli, Maharashtra"
    city: String,
    district: String
  },
  voiceProfileUrl: String,  // Cloudinary audio URL
  profilePhoto: String,     // Cloudinary image URL
  preferredLanguage: {
    type: String,
    enum: ['mr','hi','en'],
    default: 'mr'
  },
  badges: [{ skill: String, verified: Boolean }],
  rating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  jobsCompleted: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}
// IMPORTANT: add 2dsphere index
WorkerProfileSchema.index({ location: '2dsphere' });
```

### `Job.js`
```js
{
  employerId: { type: ObjectId, ref: 'User' },
  title: String,
  description: String,
  skillRequired: [String],
  jobType: { type: String, enum: ['one-time','part-time','full-time'] },
  payType: { type: String, enum: ['daily','monthly'] },
  payAmount: Number,
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number],
    address: String,
    city: String
  },
  status: { type: String, enum: ['open','filled','closed'], default: 'open' },
  language: { type: String, enum: ['mr','hi','en'] },
  applicants: [{ type: ObjectId, ref: 'User' }],
  hiredWorker: { type: ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
}
JobSchema.index({ location: '2dsphere' });
```

### `Review.js`
```js
{
  reviewerId: { type: ObjectId, ref: 'User' },
  targetId:   { type: ObjectId, ref: 'User' },
  jobId:      { type: ObjectId, ref: 'Job' },
  rating: { type: Number, min: 1, max: 5 },
  comment: String,
  createdAt: { type: Date, default: Date.now }
}
```

### `Application.js`
```js
{
  jobId:      { type: ObjectId, ref: 'Job' },
  workerId:   { type: ObjectId, ref: 'User' },
  employerId: { type: ObjectId, ref: 'User' },
  status: {
    type: String,
    enum: ['pending','accepted','rejected','completed'],
    default: 'pending'
  },
  coverNote: String,     // optional voice/text note
  appliedAt: { type: Date, default: Date.now }
}
```

### `Chat.js` (Socket.io messages)
```js
{
  participants: [{ type: ObjectId, ref: 'User' }],
  jobId: { type: ObjectId, ref: 'Job' },
  messages: [{
    senderId: { type: ObjectId, ref: 'User' },
    text: String,
    audioUrl: String,    // voice message support
    seen: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
  }],
  updatedAt: { type: Date, default: Date.now }
}
```

---

## API Routes

### `auth` — `/api/auth`
| Method | Route | Description |
|---|---|---|
| POST | `/register` | Register (worker or employer) |
| POST | `/login` | Login → return JWT |
| GET | `/me` | Get current user (protected) |
| POST | `/refresh` | Refresh JWT token |

### `workers` — `/api/workers`
| Method | Route | Description |
|---|---|---|
| GET | `/profile` | Get own profile |
| PUT | `/profile` | Update profile, skills, rate |
| POST | `/voice` | Upload voice recording → transcribe |
| PUT | `/location` | Update GPS coordinates |
| GET | `/jobs` | Get nearby matching jobs |
| POST | `/apply/:jobId` | Apply to a job |
| GET | `/applications` | Get all my applications |

### `chat` — `/api/chat`
| Method | Route | Description |
|---|---|---|
| GET | `/` | Get all conversations |
| GET | `/:chatId` | Get messages in a chat |
| POST | `/start` | Start new chat (jobId + workerId) |
| POST | `/:chatId/audio` | Send voice message |

### `jobs` — `/api/jobs`
| Method | Route | Description |
|---|---|---|
| GET | `/` | List jobs (filter: skill, city, pay) |
| POST | `/` | Post new job (employer) |
| GET | `/:id` | Get job details |
| PUT | `/:id` | Update job |
| DELETE | `/:id` | Delete / close job |
| GET | `/nearby` | Jobs near GPS coords (`$near` query) |
| GET | `/:id/applicants` | See who applied |

### `match` — `/api/match`
| Method | Route | Description |
|---|---|---|
| GET | `/workers/:jobId` | Get ranked workers for a job (sorted by distance + skill + rating) |
| GET | `/jobs/:workerId` | Get best-fit jobs for a worker |

### `employers` — `/api/employers`
| Method | Route | Description |
|---|---|---|
| GET | `/profile` | Get employer profile |
| PUT | `/profile` | Update employer profile |
| GET | `/jobs` | Get all posted jobs |
| POST | `/hire/:appId` | Accept an application |
| POST | `/review/:userId` | Submit review for worker |

### `admin` — `/api/admin`
| Method | Route | Description |
|---|---|---|
| GET | `/users` | All users + filter |
| PUT | `/verify/:userId` | Verify skill badge |
| DELETE | `/:userId` | Remove user |
| GET | `/analytics` | Platform stats |

---

## Key Logic

### `utils/matchEngine.js` — geospatial + skill ranking
```js
// Find workers near a job within radiusKm
async function matchWorkersForJob(job, radiusKm = 10) {
  const workers = await WorkerProfile.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: job.location.coordinates
        },
        $maxDistance: radiusKm * 1000  // meters
      }
    },
    skills: { $in: job.skillRequired },
    availability: 'available'
  }).populate('userId', 'name phone');

  // Score each worker
  return workers.map(w => {
    let score = 0;
    // Skill overlap
    const overlap = job.skillRequired.filter(
      s => w.skills.includes(s)
    ).length;
    score += overlap * 30;
    // Rating bonus (max 5 stars = 25 pts)
    score += (w.rating / 5) * 25;
    // Jobs completed (experience signal)
    score += Math.min(w.jobsCompleted, 10) * 2;
    return { worker: w, score };
  }).sort((a, b) => b.score - a.score);
}
```

**Scoring breakdown mentioned in viva notes**: skill overlap (30 pts), rating (25 pts), experience (20 pts), distance (25 pts) — note the code above implements skill/rating/experience; distance weighting can be added explicitly if needed for the full 100-pt breakdown.

### `utils/voiceTranscribe.js` — voice → text profile
```js
// Uses Google Speech-to-Text API
// Supports Marathi (mr-IN) and Hindi (hi-IN)
const speech = require('@google-cloud/speech');
const client = new speech.SpeechClient();

async function transcribeAudio(audioBuffer, langCode) {
  // langCode: 'mr-IN' or 'hi-IN' or 'en-IN'
  const [response] = await client.recognize({
    audio: { content: audioBuffer.toString('base64') },
    config: {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode: langCode,
      alternativeLanguageCodes: ['hi-IN', 'mr-IN']
    }
  });
  return response.results
    .map(r => r.alternatives[0].transcript)
    .join(' ');
}
// Transcribed text → stored as worker bio
// Original audio → stored on Cloudinary
// Employer can play audio OR read text translation
```

### `i18n/mr.js` — Marathi UI strings (sample)
```js
export default {
  welcome: 'स्वागत आहे',
  findJob: 'नोकरी शोधा',
  postJob: 'नोकरी द्या',
  myProfile: 'माझी माहिती',
  skills: 'कौशल्ये',
  location: 'स्थान',
  dailyPay: 'रोजची मजुरी',
  available: 'उपलब्ध आहे',
  busy: 'व्यस्त आहे',
  recordVoice: 'आवाज रेकॉर्ड करा',
  sendMessage: 'संदेश पाठवा',
  rating: 'मूल्यांकन',
}
```
> Approach: use Google Translate for initial string files, then have a Marathi-speaking classmate/faculty review them.

---

## React Native Screens Breakdown

**`VoiceProfile.jsx`**
- Large record button — tap and speak in Marathi/Hindi
- Live waveform while recording (`expo-av`)
- Transcribed text shown below for review
- Skill chips — tap to add (Plumber, Driver, etc.)
- Daily rate input + availability toggle

**`JobList.jsx`** (worker view)
- Jobs sorted by distance from current GPS
- Each card: skill needed, pay, km away
- Filter by skill, distance, pay type
- One-tap apply with optional voice note
- Map view toggle

**`MatchedWorkers.jsx`** (employer)
- Ranked list of workers for posted job
- Each card: skill badges, rating, distance, rate
- Play voice profile audio directly
- Chat button — opens direct conversation
- Send job offer in one tap

**`ChatScreen.jsx`**
- WhatsApp-style bubble UI
- Text + voice message support
- Real-time via Socket.io
- Message seen/delivered ticks
- Job details pinned at top of chat

**`PostJob.jsx`** (employer)
- Job title, skill needed (multi-select chips)
- Pay amount + type (daily/monthly)
- Auto-detect location or set manually on map
- Language for job post (Marathi/Hindi/English)
- Preview before posting

**`SettingsScreen.jsx`**
- Language switcher — Marathi / Hindi / English
- Notification preferences
- Update location / area
- Change phone number / password
- Delete account

---

## Full Tech Stack
| Layer | Tech |
|---|---|
| Mobile app | React Native (Expo) — runs on Android + iOS, easy demo via Expo Go |
| Navigation | React Navigation v6 — Stack + Bottom Tab, role-based routing |
| Backend | Node.js + Express.js — REST API, JWT auth, bcryptjs, Multer for uploads |
| Real-time chat | Socket.io — bidirectional messaging, room-based per conversation |
| Database | MongoDB Atlas — 2dsphere geospatial index for `$near` queries, Mongoose ODM |
| Voice recording | `expo-av` (record); `expo-speech` (TTS for reading job descriptions aloud) |
| Voice → text | Google Cloud Speech-to-Text API — Marathi (mr-IN) + Hindi (hi-IN) |
| File storage | Cloudinary — profile photos + voice audio (free tier 25GB) |
| Maps | `react-native-maps` + `expo-location` — show jobs/workers on map, GPS auto-detect |
| i18n | `i18next` + `react-i18next` — Marathi, Hindi, English JSON string files |
| Notifications | `expo-notifications` + Firebase FCM — push alerts for offers/messages |
| Admin panel | React (Vite) web app — same Express backend, separate frontend on Vercel |
| Deploy | Render (backend) + MongoDB Atlas (DB) + Cloudinary (files) + EAS Build (APK) |

---

## 4-Month Timeline

**Month 1 (weeks 1–4) — Foundation**
- Expo project setup + navigation
- Auth screens (login/register)
- MERN backend + MongoDB Atlas
- Worker + Job schemas
- Auth APIs (JWT)
- i18n setup (mr/hi/en)

**Month 2 (weeks 5–8) — Core features**
- Voice profile recording
- Google STT integration
- Job posting (employer)
- GPS location + map view
- Geospatial `$near` query
- Match engine logic

**Month 3 (weeks 9–12) — Advanced features**
- Socket.io real-time chat
- Voice messages in chat
- Apply / hire / review flow
- Skill badge system
- Push notifications (FCM)
- Admin web panel

**Month 4 (weeks 13–16) — Polish & deploy**
- UI polish + Marathi review
- Error handling + loaders
- Deploy backend → Render
- Build APK via EAS Build
- Admin panel → Vercel
- Testing + viva prep

---

## Deployment (₹0 cost)

### Backend → Render + MongoDB Atlas
1. **MongoDB Atlas** — Free M0 cluster → get `MONGO_URI` connection string
2. **Push backend to GitHub** — separate `/backend` repo or monorepo subfolder
3. **Render → New Web Service** — Build: `npm install`, Start: `node server.js`
4. **Add environment variables**: `MONGO_URI`, `JWT_SECRET`, `CLOUDINARY_*`, `GOOGLE_STT_KEY`, `FIREBASE_KEY`
5. **Live backend URL** — e.g. `https://job-portal-api.onrender.com` → paste into mobile app's `axios.js`

### Mobile app → APK via EAS Build (Expo)
1. Install EAS CLI: `npm install -g eas-cli` then `eas login`
2. Configure `eas.json` — set build profile to `preview` for APK (free, no Play Store needed)
3. Set API URL in `.env`: `EXPO_PUBLIC_API_URL = <Render backend URL>`
4. Build APK: `eas build -p android --profile preview` (~10 min, gives download link)
5. **Demo in viva**: Install APK on phone → demo live app. Or use **Expo Go** during development for instant QR-code preview (no APK needed for the presentation).

### Admin web panel → Vercel
Same as any React app. Same backend serves both mobile API and admin panel.

---

## Viva Prep

### Technical highlights to mention
- **2dsphere geospatial index** — MongoDB's `$near` operator finds workers within X km using actual GPS coordinates, not just city name. ~10 lines of code but genuinely impressive to most evaluators.
- **Voice-first UX** — literacy barrier solved using Google STT with `mr-IN` locale; audio stored on Cloudinary for playback
- **i18n architecture** — `LanguageContext` wraps the entire app; switching language re-renders all strings instantly, no reload
- **Scoring algorithm** — match engine weighs skill overlap (30 pts), rating (25 pts), experience (20 pts), distance (25 pts)
- **Socket.io rooms** — each conversation is a private room keyed by `chatId`; messages never cross between conversations

### Expected viva Q&A
**Q: Why React Native over Flutter?**
A: Code sharing with React web admin panel; same JS knowledge from MERN stack; Expo simplifies build.

**Q: How is location privacy handled?**
A: Worker shares only city/district publicly; exact GPS used only for backend matching, never exposed to employer.

**Q: What if no internet?**
A: Future scope — offline job browsing cache using AsyncStorage + sync on reconnect.

**Q: Future scope?**
A: Aadhaar-based identity verification, UPI payment integration, government ASEEM portal API integration.

---

## Notes for Implementation
- Get the **match engine working first** — it's the core differentiator; demo-readiness depends on it.
- For Marathi strings: machine-translate first (Google Translate), then have a native speaker review — evaluators respect the attempt even if imperfect.
- Demo via **Expo Go** (QR code scan) rather than building an APK for the live viva — faster and no install friction. EAS Build APK is still worth having as a backup / for submission.
- Starting files to request first when generating code: `server.js` (with Socket.io setup) and `matchEngine.js`.

// Mirrors backend2/src/constants.js - kept in one place so every dropdown/
// badge in the app reads from the same real, backend-verified enum values.

export const USER_ROLES = {
  WORKER: "worker",
  EMPLOYER: "employer",
  ADMIN: "admin",
};

export const APP_LANGUAGES = ["mr", "hi", "en"];

export const LANGUAGE_LABELS = {
  mr: "मराठी",
  hi: "हिंदी",
  en: "English",
};

export const AVAILABILITY_OPTIONS = ["available", "busy", "unavailable"];

export const PAY_TYPES = ["daily", "monthly", "fixed"];

export const JOB_STATUS = [
  "draft",
  "open",
  "partially_assigned",
  "assigned",
  "completed",
  "cancelled",
  "expired",
];

export const APPLICATION_STATUS = [
  "applied",
  "shortlisted",
  "accepted",
  "rejected",
  "completed",
  "withdrawn",
];

export const SHIFT_TYPES = ["day", "night", "flexible"];

export const WORKER_SKILL_PROFICIENCY = ["beginner", "intermediate", "expert"];

export const MATCH_FACTOR_ORDER = ["skill", "location", "availability", "pay", "rating", "relevance"];

export const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/webm",
  "audio/x-m4a",
];

export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export const DB_NAME = "LokRozgar_AI";

export const USER_ROLES = {
  WORKER: "worker",
  EMPLOYER: "employer",
  ADMIN: "admin",
};

export const ROLES = Object.values(USER_ROLES);

export const LANGUAGES = {
  MARATHI: "mr",
  HINDI: "hi",
  ENGLISH: "en",
};

export const PREFERRED_LANGUAGES = Object.values(LANGUAGES);

export const JOB_STATUS = {
  OPEN: "open",
  ASSIGNED: "assigned",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

export const APPLICATION_STATUS = {
  APPLIED: "applied",
  SHORTLISTED: "shortlisted",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  COMPLETED: "completed",
  WITHDRAWN: "withdrawn",
};

export const PAYMENT_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
};

export const DISPUTE_STATUS = {
  OPEN: "open",
  UNDER_REVIEW: "under_review",
  RESOLVED: "resolved",
  CLOSED: "closed",
};

export const STATUSES = {
  JOB: JOB_STATUS,
  APPLICATION: APPLICATION_STATUS,
  PAYMENT: PAYMENT_STATUS,
  DISPUTE: DISPUTE_STATUS,
};

export const TOKEN_EXPIRY = {
  ACCESS_TOKEN: process.env.ACCESS_TOKEN_EXPIRY || "1d",
  REFRESH_TOKEN: process.env.REFRESH_TOKEN_EXPIRY || "10d",
};

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
};
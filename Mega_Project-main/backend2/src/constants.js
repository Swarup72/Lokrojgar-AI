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
  // An employer-initiated request awaiting the worker's answer. It is a
  // status on the SAME Application document rather than a separate "job
  // request" entity, so there is exactly one row - and one unique
  // {jobId, workerId} index - per hiring relationship, whichever side
  // started it.
  INVITED: "invited",
  SHORTLISTED: "shortlisted",
  ACCEPTED: "accepted",
  // The employer turned a worker down.
  REJECTED: "rejected",
  // The WORKER turned an invitation down. Kept distinct from "rejected" so
  // the two directions are never confused in the UI or in reporting.
  DECLINED: "declined",
  COMPLETED: "completed",
  WITHDRAWN: "withdrawn",
};

/** Who created the Application row. */
export const APPLICATION_INITIATORS = {
  WORKER: "worker",
  EMPLOYER: "employer",
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
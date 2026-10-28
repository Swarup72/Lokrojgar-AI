// Translation keys for the backend enum values that are shown to users.
//
// The enum VALUE itself ("daily", "partially_assigned") is the API contract and
// must never be translated; only its label is. Keeping the mapping here means a
// status badge, a dropdown and a job card all read the same wording, and adding
// a backend enum value fails loudly in one place instead of silently printing
// the raw value in English on five screens.
//
// Use with the t() from useLanguage: t(PAY_TYPE_KEYS[job.payType]).

export const PAY_TYPE_KEYS = {
  daily: "jobs.search.payDaily",
  monthly: "jobs.search.payMonthly",
  fixed: "jobs.search.payFixed",
};

export const SHIFT_TYPE_KEYS = {
  day: "jobs.form.shiftDay",
  night: "jobs.form.shiftNight",
  flexible: "jobs.form.shiftFlexible",
};

export const AVAILABILITY_KEYS = {
  available: "common.available",
  busy: "common.busy",
  unavailable: "common.unavailable",
};

export const PROFICIENCY_KEYS = {
  beginner: "skills.beginner",
  intermediate: "skills.intermediate",
  expert: "skills.expert",
};

export const STATUS_KEYS = {
  // Application statuses
  applied: "common.applied",
  shortlisted: "common.shortlisted",
  accepted: "common.accepted",
  rejected: "common.rejected",
  completed: "common.completed",
  withdrawn: "common.withdrawn",
  // Job statuses
  draft: "status.draft",
  open: "common.open",
  partially_assigned: "status.partiallyAssigned",
  assigned: "status.assigned",
  cancelled: "common.cancelled",
  expired: "status.expired",
  // Worker availability
  ...AVAILABILITY_KEYS,
};

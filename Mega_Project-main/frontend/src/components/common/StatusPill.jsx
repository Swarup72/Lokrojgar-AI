import "./StatusPill.css";

const LABELS = {
  // Application statuses
  applied: "Applied",
  shortlisted: "Shortlisted",
  accepted: "Accepted",
  rejected: "Rejected",
  completed: "Completed",
  withdrawn: "Withdrawn",
  // Job statuses
  draft: "Draft",
  open: "Open",
  partially_assigned: "Partially assigned",
  assigned: "Assigned",
  cancelled: "Cancelled",
  expired: "Expired",
  // Worker availability
  available: "Available",
  busy: "Busy",
  unavailable: "Unavailable",
};

const TONES = {
  applied: "info",
  shortlisted: "info",
  accepted: "success",
  completed: "success",
  open: "success",
  assigned: "success",
  rejected: "danger",
  withdrawn: "muted",
  cancelled: "danger",
  expired: "muted",
  draft: "muted",
  partially_assigned: "warning",
  available: "success",
  busy: "warning",
  unavailable: "danger",
};

/** @param {{status: string}} props */
export function StatusPill({ status }) {
  const tone = TONES[status] || "muted";
  return <span className={`status-pill status-pill-${tone}`}>{LABELS[status] || status}</span>;
}

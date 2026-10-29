import { useLanguage } from "../../hooks/useLanguage";
import { STATUS_KEYS } from "../../utils/enumLabels";
import "./StatusPill.css";



const TONES = {
  pending: "warning",
  confirmed: "success",
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
  const { t } = useLanguage();
  const tone = TONES[status] || "muted";
  // An unmapped status falls back to the raw value rather than rendering blank,
  // so a new backend enum is visible instead of invisible.
  const label = STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status;
  return <span className={`status-pill status-pill-${tone}`}>{label}</span>;
}

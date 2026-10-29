import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Clock,
  Building2,
  UserRound,
  Briefcase,
  CheckCircle2,
  XCircle,
  Ban,
} from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { StatusPill } from "../common/StatusPill";
import {
  appointmentLocalDate,
  formatDisplayDate,
  formatTimeRange,
} from "../../utils/calendarHelpers";

/**
 * Displays a single appointment card with role-appropriate actions and
 * confirmation prompts for destructive operations.
 *
 * @param {{
 *   appointment: object,
 *   perspective: "worker" | "employer",
 *   onAccept?: (id: string) => Promise<void>,
 *   onReject?: (id: string) => Promise<void>,
 *   onCancel?: (id: string) => Promise<void>,
 *   onComplete?: (id: string) => Promise<void>,
 *   busyId?: string|null
 * }} props
 */
export function AppointmentCard({
  appointment,
  perspective = "worker",
  onAccept,
  onReject,
  onCancel,
  onComplete,
  busyId = null,
}) {
  const { language, t } = useLanguage();
  const [confirmMode, setConfirmMode] = useState(null); // "reject" | "cancel" | null

  if (!appointment) return null;

  const isBusy = busyId === appointment._id;
  const tz = appointment.timeZone || "Asia/Kolkata";
  const localDate = appointmentLocalDate(appointment.startAt, tz);
  const dateLabel = formatDisplayDate(localDate, language);
  const timeLabel = formatTimeRange(appointment.startAt, appointment.endAt, language, tz);

  const employerName =
    appointment.employerId?.businessName ||
    appointment.employerId?.userId?.fullName ||
    t("scheduling.employerLabel");
  const workerName = appointment.workerId?.fullName || t("scheduling.workerLabel");
  const jobTitle = appointment.jobId
    ? pickLocalizedText(appointment.jobId.title, language, appointment.jobId.originalLanguage)
    : null;

  const status = appointment.status;
  const canWorkerRespond = perspective === "worker" && status === "pending";
  const canCancel = status === "pending" || status === "confirmed";
  const canComplete = status === "confirmed" && Boolean(onComplete);

  return (
    <article className="appointment-card" aria-label={`${employerName} - ${dateLabel}`}>
      <div className="appointment-card-header">
        <div>
          <h4 className="appointment-card-title">
            {perspective === "worker" ? (
              <>
                <Building2 size={16} aria-hidden="true" style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
                {employerName}
              </>
            ) : (
              <>
                <UserRound size={16} aria-hidden="true" style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
                {workerName}
              </>
            )}
          </h4>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="appointment-card-meta">
        <span>
          <Calendar size={14} aria-hidden="true" />
          <strong>{dateLabel}</strong>
        </span>
        <span>
          <Clock size={14} aria-hidden="true" />
          {timeLabel} ({t("scheduling.durationMinutes", { minutes: appointment.durationMinutes || 30 })})
        </span>
        {jobTitle && appointment.jobId?._id && (
          <span>
            <Briefcase size={14} aria-hidden="true" />
            <Link to={`/jobs/${appointment.jobId._id}`}>{jobTitle}</Link>
          </span>
        )}
      </div>

      {appointment.purpose && (
        <div className="appointment-card-purpose">
          <strong>{t("scheduling.purposeHeading")}: </strong>
          <span>{appointment.purpose}</span>
        </div>
      )}

      <div className="appointment-card-meta" style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 0 }}>
        {appointment.createdAt && (
          <span>
            {t("scheduling.requestedAt")}: {new Date(appointment.createdAt).toLocaleString()}
          </span>
        )}
        {status === "pending" && appointment.expiresAt && (
          <span>
            {t("scheduling.expiresAt")}: {new Date(appointment.expiresAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {(canWorkerRespond || canCancel || canComplete) && (
        <div className="appointment-card-actions">
          {canWorkerRespond && onAccept && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={isBusy}
              onClick={() => onAccept(appointment._id)}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{t("scheduling.acceptBtn")}</span>
            </button>
          )}

          {canWorkerRespond && onReject && confirmMode !== "reject" && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isBusy}
              onClick={() => setConfirmMode("reject")}
            >
              <XCircle size={16} aria-hidden="true" />
              <span>{t("scheduling.rejectBtn")}</span>
            </button>
          )}

          {canComplete && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isBusy}
              onClick={() => onComplete(appointment._id)}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{t("scheduling.completeBtn")}</span>
            </button>
          )}

          {canCancel && onCancel && confirmMode !== "cancel" && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={isBusy}
              onClick={() => setConfirmMode("cancel")}
            >
              <Ban size={16} aria-hidden="true" />
              <span>{t("scheduling.cancelBtn")}</span>
            </button>
          )}

          {confirmMode && (
            <div className="appointment-confirm-box" role="alert">
              <span>
                {confirmMode === "reject"
                  ? t("scheduling.confirmRejectPrompt")
                  : t("scheduling.confirmCancelPrompt")}
              </span>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isBusy}
                onClick={async () => {
                  const mode = confirmMode;
                  setConfirmMode(null);
                  if (mode === "reject" && onReject) await onReject(appointment._id);
                  if (mode === "cancel" && onCancel) await onCancel(appointment._id);
                }}
              >
                {t("scheduling.confirmYes")}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isBusy}
                onClick={() => setConfirmMode(null)}
              >
                {t("scheduling.confirmNo")}
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}


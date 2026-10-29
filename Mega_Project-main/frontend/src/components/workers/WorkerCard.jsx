import { useState } from "react";
import { User, MapPin, Briefcase, CalendarPlus } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { RatingStars } from "../common/RatingStars";
import { StatusPill } from "../common/StatusPill";
import { MatchScoreBadge } from "../recommendations/MatchScoreBadge";
import { MatchFactorsList } from "../recommendations/MatchFactorsList";
import { AppointmentBookingModal } from "../scheduling/AppointmentBookingModal";
import "./WorkerCard.css";

/**
 * @param {{worker: object, jobId?: string|null, matchScore?: number|null, matchFactors?: object, explanation?: object, actions?: React.ReactNode, showBookAppointment?: boolean}} props
 */
export function WorkerCard({
  worker,
  jobId = null,
  matchScore,
  matchFactors,
  explanation,
  actions,
  showBookAppointment = true,
}) {
  const { t } = useLanguage();
  const [bookingOpen, setBookingOpen] = useState(false);

  return (
    <div className="worker-card">
      <div className="worker-card-icon">
        {worker.profilePhoto ? (
          <img src={worker.profilePhoto} alt="" />
        ) : (
          <User size={26} aria-hidden="true" />
        )}
      </div>
      <div className="worker-card-body">
        <div className="worker-card-title-row">
          <h3>{worker.fullName || "Worker"}</h3>
          <MatchScoreBadge score={matchScore} />
        </div>
        <div className="worker-card-meta">
          {worker.city && (
            <span>
              <MapPin size={14} aria-hidden="true" /> {worker.city}
            </span>
          )}
          <span>
            <Briefcase size={14} aria-hidden="true" /> {worker.experienceYears || 0} yrs experience
          </span>
          <RatingStars value={worker.ratingAvg || 0} count={worker.ratingCount || 0} />
          <StatusPill status={worker.availability} />
        </div>
        {matchFactors && <MatchFactorsList matchFactors={matchFactors} explanation={explanation} />}
        {(actions || (showBookAppointment && worker?._id)) && (
          <div className="worker-card-actions">
            {actions}
            {showBookAppointment && worker?._id && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setBookingOpen(true)}
              >
                <CalendarPlus size={16} aria-hidden="true" />
                <span>{t("scheduling.requestAppointmentBtn")}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {bookingOpen && (
        <AppointmentBookingModal
          worker={worker}
          jobId={jobId}
          onClose={() => setBookingOpen(false)}
        />
      )}
    </div>
  );
}

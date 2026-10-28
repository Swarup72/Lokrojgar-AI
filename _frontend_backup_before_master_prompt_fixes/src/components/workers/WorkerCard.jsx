import { User, MapPin, Briefcase } from "lucide-react";
import { RatingStars } from "../common/RatingStars";
import { StatusPill } from "../common/StatusPill";
import { MatchScoreBadge } from "../recommendations/MatchScoreBadge";
import { MatchFactorsList } from "../recommendations/MatchFactorsList";
import "./WorkerCard.css";

/**
 * @param {{worker: object, matchScore?: number|null, matchFactors?: object, explanation?: object, actions?: React.ReactNode}} props
 */
export function WorkerCard({ worker, matchScore, matchFactors, explanation, actions }) {
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
        {actions && <div className="worker-card-actions">{actions}</div>}
      </div>
    </div>
  );
}

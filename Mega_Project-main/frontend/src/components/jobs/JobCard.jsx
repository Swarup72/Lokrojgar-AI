import { useNavigate } from "react-router-dom";
import { Briefcase, MapPin, Wallet, ChevronRight, Navigation } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { MatchScoreBadge } from "../recommendations/MatchScoreBadge";
import { MatchFactorsList } from "../recommendations/MatchFactorsList";
import { employerName } from "../../utils/displayName";
import "./JobCard.css";

/**
 * Renders one job. Handles both possible shapes seen across endpoints:
 * `/jobs/search` results are populated (categoryId/employerId are objects)
 * and carry pre-localized `titleText`; `/jobs/nearby` results are raw
 * (categoryId/employerId are ObjectId strings) and carry `distanceMeters`
 * instead. `categoriesById` is an optional {id: category} map used to
 * resolve a category name when the job itself isn't populated.
 *
 * `matchScore`/`matchFactors` are optional - when passed (worker
 * recommendations), the card also renders the match badge/factor checklist
 * and an Apply button, reusing this same card rather than duplicating its
 * markup in a separate "recommended job card" component.
 */
export function JobCard({ job, categoriesById, matchScore, matchFactors, explanation, onApply, applyDisabled, applyLabel }) {
  const { language, t } = useLanguage();
  const navigate = useNavigate();

  const title = job.titleText || pickLocalizedText(job.title, language, job.originalLanguage);
  // businessName is optional now - an employer may hire under their own name,
  // which job reads supply as employerId.userId.fullName.
  const postedBy = employerName(job.employerId);
  const category =
    typeof job.categoryId === "object" ? job.categoryId : categoriesById?.[job.categoryId];
  // A category populated directly on a Job (via Mongoose .populate) is the
  // raw JobCategory doc, whose `name` is itself a {mr,hi,en} map - only the
  // catalog LIST endpoint decorates entries with a pre-localized `name`
  // string (plus `nameMultilingual`). Route both possible shapes through
  // pickLocalizedText so a raw object is never handed straight to JSX.
  const categoryName =
    typeof category?.name === "string"
      ? category.name
      : pickLocalizedText(category?.nameMultilingual || category?.name, language);

  const handleView = () => navigate(`/jobs/${job._id}`, { state: { job } });

  return (
    <div className="job-card" onClick={handleView} role="button" tabIndex={0}
      onKeyDown={(event) => event.key === "Enter" && handleView()}>
      <div className="job-card-icon">
        <Briefcase size={26} aria-hidden="true" />
      </div>
      <div className="job-card-body">
        <div className="job-card-title-row">
          <h2>{title || t("jobs.untitled")}</h2>
          <MatchScoreBadge score={matchScore} />
        </div>
        {postedBy && <h3>{postedBy}</h3>}
        <div className="job-card-meta">
          {job.city && (
            <span>
              <MapPin size={15} aria-hidden="true" /> {job.city}
            </span>
          )}
          <span>
            <Wallet size={15} aria-hidden="true" /> ₹{job.payAmount} / {job.payType}
          </span>
          {categoryName && <span>{categoryName}</span>}
          {typeof job.distanceMeters === "number" && (
            <span>
              <Navigation size={15} aria-hidden="true" /> {(job.distanceMeters / 1000).toFixed(1)} km away
            </span>
          )}
        </div>
        {matchFactors && <MatchFactorsList matchFactors={matchFactors} explanation={explanation} />}
        {onApply && (
          <button
            type="button"
            className="btn btn-primary job-card-apply"
            disabled={applyDisabled}
            onClick={(event) => {
              event.stopPropagation();
              onApply();
            }}
          >
            {applyLabel || "Apply"}
          </button>
        )}
      </div>
      <div className="job-card-arrow">
        <span className="visually-hidden">{t("common.view")}</span>
        <ChevronRight size={20} aria-hidden="true" />
      </div>
    </div>
  );
}

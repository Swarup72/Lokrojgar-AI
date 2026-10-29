
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  MapPin,
  Wallet,
  ChevronRight,
  Navigation,
  Zap,
  Wrench,
  CarFront,
  Hammer,
  Paintbrush,
  ChefHat,
  Sprout,
  HardHat,
  Package,
  ArrowRight,
  CheckCircle2,
  Star,
} from "lucide-react";

import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { MatchScoreBadge } from "../recommendations/MatchScoreBadge";
import { MatchFactorsList } from "../recommendations/MatchFactorsList";
import { getSkillMessageKey } from "../../utils/matchDisplay";
import { RatingStars } from "../common/RatingStars";
import { EmployerReviewsModal } from "../reviews/EmployerReviewsModal";
import { employerName } from "../../utils/displayName";

import "./JobCard.css";

const OCCUPATION_ICONS = [
  { words: ["electrician", "electrical", "इलेक्ट्रीशियन", "इलेक्ट्रिशियन"], icon: Zap, color: "yellow" },
  { words: ["plumber", "plumbing", "प्लंबर"], icon: Wrench, color: "blue" },
  { words: ["driver", "driving", "ड्राइवर", "वाहनचालक"], icon: CarFront, color: "green" },
  { words: ["carpenter", "बढ़ई", "सुतार"], icon: Hammer, color: "orange" },
  { words: ["painter", "painting", "पेंटर", "रंगारी"], icon: Paintbrush, color: "purple" },
  { words: ["cook", "chef", "रसोइया", "स्वयंपाकी"], icon: ChefHat, color: "red" },
  { words: ["farmer", "farming", "किसान", "शेतकरी"], icon: Sprout, color: "green" },
  { words: ["construction", "mason", "बांधकाम", "निर्माण"], icon: HardHat, color: "yellow" },
  { words: ["delivery", "courier", "डिलीवरी", "डिलिव्हरी"], icon: Package, color: "blue" },
];

const LABELS = {
  en: {
    viewJob: "View Job Details",
    apply: "Apply Now",
    location: "Location",
    salary: "Salary",
    away: "away",
    postedBy: "Posted by",
    viewReviews: "Read reviews",
  },
  hi: {
    viewJob: "नौकरी की जानकारी देखें",
    apply: "अभी आवेदन करें",
    location: "स्थान",
    salary: "वेतन",
    away: "दूर",
    postedBy: "नौकरी देने वाला",
    viewReviews: "रिव्यू देखें",
  },
  mr: {
    viewJob: "नोकरीची माहिती पहा",
    apply: "आता अर्ज करा",
    location: "ठिकाण",
    salary: "पगार",
    away: "अंतर",
    postedBy: "नोकरी देणारे",
    viewReviews: "रिव्ह्यू पाहा",
  },
};

export function JobCard({
  job,
  categoriesById,
  matchScore,
  originalMatchScore,
  matchFactors,
  explanation,
  matchingSkills,
  missingSkills,
  skillMatchStatus,
  onApply,
  applyDisabled,
  applyLabel,
}) {
  const { language, t } = useLanguage();
  const navigate = useNavigate();

  const skillMessageKey = getSkillMessageKey({ skillMatchStatus, matchingSkills, job });

  const lang = String(language || "en").toLowerCase().slice(0, 2);
  const ui = LABELS[lang] || LABELS.en;

  const title =
    job.titleText ||
    pickLocalizedText(job.title, language, job.originalLanguage) ||
    t("jobs.untitled");

  const postedBy = employerName(job.employerId);

  const category =
    typeof job.categoryId === "object" && job.categoryId !== null
      ? job.categoryId
      : categoriesById?.[job.categoryId];

  const categoryName =
    typeof category?.name === "string"
      ? category.name
      : pickLocalizedText(
          category?.nameMultilingual || category?.name,
          language
        );

  const occupationText = `${title} ${categoryName || ""}`.toLowerCase();

  const occupation =
    OCCUPATION_ICONS.find((item) =>
      item.words.some((word) => occupationText.includes(word))
    ) || { icon: Briefcase, color: "default" };

  const OccupationIcon = occupation.icon;

  const handleView = () => {
    navigate(`/jobs/${job._id}`, { state: { job } });
  };

  const hasPay =
    job.payAmount !== undefined &&
    job.payAmount !== null &&
    job.payAmount !== "";

  const formattedPay = hasPay
    ? `₹${Number(job.payAmount).toLocaleString("en-IN")}`
    : null;

  const employerRatingAvg =
    typeof job.employerId?.ratingAvg === "number"
      ? job.employerId.ratingAvg
      : typeof job.employerRatingAvg === "number"
      ? job.employerRatingAvg
      : undefined;

  const employerRatingCount =
    typeof job.employerId?.ratingCount === "number"
      ? job.employerId.ratingCount
      : typeof job.employerRatingCount === "number"
      ? job.employerRatingCount
      : 0;

  const [showReviewsModal, setShowReviewsModal] = useState(false);

  const employerUserId =
    job.employerId?.userId?._id ||
    job.employerId?.userId ||
    job.employerUserId ||
    (typeof job.employerId === "string" ? job.employerId : null);

  const handleOpenReviews = (event) => {
    event.stopPropagation();
    setShowReviewsModal(true);
  };

  const handleApply = (event) => {
    event.stopPropagation();

    if (applyDisabled) return;

    if (onApply) {
      onApply();
    } else {
      handleView();
    }
  };

  return (
    <article className="job-card">
      <div className="job-card-main">
        <div
          className={`job-card-icon job-card-icon-${occupation.color}`}
          aria-hidden="true"
        >
          <OccupationIcon size={33} strokeWidth={1.8} />
        </div>

        <div className="job-card-body">
          <div className="job-card-title-row">
            <h2 className="job-card-title">{title}</h2>

            {(matchScore != null || originalMatchScore != null || matchFactors) && (
              // The badge shows the backend's own overall score (the same figure the
              // match factors below are computed from). matchScore may carry the
              // frontend's skill-first ranking adjustment, which only affects order.
              <MatchScoreBadge
                score={originalMatchScore ?? matchScore}
                showUnavailable={Boolean(matchFactors)}
              />
            )}
          </div>

          {matchFactors && (
            <p className="job-card-match-helper">{t("match.scoreHelper")}</p>
          )}

          {postedBy && (
            <div className="job-card-employer-row">
              <button
                type="button"
                className="job-card-employer-btn"
                onClick={handleOpenReviews}
                title={ui.viewReviews}
                aria-label={`${ui.postedBy}: ${postedBy}. ${ui.viewReviews}`}
              >
                <span className="job-card-employer-name">
                  {ui.postedBy}: <strong>{postedBy}</strong>
                </span>
                <span className="job-card-employer-rating">
                  <RatingStars
                    value={employerRatingAvg}
                    count={employerRatingCount}
                    compact
                  />
                </span>
                <span className="job-card-reviews-pill">
                  {ui.viewReviews}
                </span>
              </button>
            </div>
          )}

          {categoryName && (
            <span className="job-card-category">
              <Briefcase size={14} aria-hidden="true" />
              {categoryName}
            </span>
          )}
        </div>
      </div>

      <div className="job-card-info">
        {job.city && (
          <div className="job-card-info-item">
            <span className="job-card-info-icon location">
              <MapPin size={21} aria-hidden="true" />
            </span>

            <div className="job-card-info-text">
              <span className="job-card-info-label">{ui.location}</span>
              <strong>{job.city}</strong>
            </div>
          </div>
        )}

        {hasPay && (
          <div className="job-card-info-item">
            <span className="job-card-info-icon salary">
              <Wallet size={21} aria-hidden="true" />
            </span>

            <div className="job-card-info-text">
              <span className="job-card-info-label">{ui.salary}</span>
              <strong>
                {formattedPay}
                {job.payType ? ` / ${job.payType}` : ""}
              </strong>
            </div>
          </div>
        )}

        {typeof job.distanceMeters === "number" && (
          <div className="job-card-info-item">
            <span className="job-card-info-icon distance">
              <Navigation size={21} aria-hidden="true" />
            </span>

            <div className="job-card-info-text">
              <span className="job-card-info-label">{ui.away}</span>
              <strong>
                {(job.distanceMeters / 1000).toFixed(1)} km
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* Skill matching breakdown */}
      {matchFactors && (
        <div className="job-card-skills-overview">
          {skillMessageKey === null ? (
            <div className="job-skills-matched">
              <span className="skills-badge matched">
                <CheckCircle2 size={14} aria-hidden="true" />
                <strong>{t("recommendations.matchingSkills")}:</strong>
              </span>
              <div className="skills-chip-list">
                {(matchingSkills || []).map((s) => (
                  <span key={s._id || s} className="skill-chip match">
                    {pickLocalizedText(s.nameMultilingual || s.name, language) || (typeof s.name === "string" ? s.name : "") || "Skill"}
                  </span>
                ))}
              </div>
            </div>
          ) : skillMessageKey === "recommendations.skillsNotSpecified" ? (
            <div className="job-skills-unspecified">
              <span className="skills-badge unspecified">{t(skillMessageKey)}</span>
            </div>
          ) : (
            <div className="job-skills-unmatched">
              <span className="skills-badge unmatched">{t(skillMessageKey)}</span>
            </div>
          )}
        </div>
      )}

      {matchFactors && (
        <div className="job-card-match-details">
          <MatchFactorsList
            matchFactors={matchFactors}
            explanation={explanation}
            showSummary={false}
          />
        </div>
      )}

      <div className="job-card-actions">
        <button
          type="button"
          className="job-card-view-btn"
          onClick={handleView}
          aria-label={ui.viewJob}
        >
          <span>{ui.viewJob}</span>
          <ChevronRight size={20} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="job-card-apply-btn"
          onClick={handleApply}
          disabled={applyDisabled}
          aria-label={applyLabel || ui.apply}
        >
          {applyDisabled ? (
            <CheckCircle2 size={20} aria-hidden="true" />
          ) : (
            <ArrowRight size={20} aria-hidden="true" />
          )}

          <span>{applyLabel || ui.apply}</span>
        </button>
      </div>

      <EmployerReviewsModal
        isOpen={showReviewsModal}
        onClose={() => setShowReviewsModal(false)}
        employerName={postedBy}
        userId={employerUserId}
        employerProfile={typeof job.employerId === "object" ? job.employerId : null}
        ratingAvg={employerRatingAvg}
        ratingCount={employerRatingCount}
      />
    </article>
  );
}

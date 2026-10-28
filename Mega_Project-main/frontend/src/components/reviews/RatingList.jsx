import { useMemo } from "react";
import { HardHat, Building2, Briefcase, UserRound } from "lucide-react";
import { useAsync } from "../../hooks/useAsync";
import { useLanguage } from "../../hooks/useLanguage";
import * as ratingsApi from "../../api/ratings";
import { RatingStars } from "../common/RatingStars";
import { Spinner } from "../common/Spinner";
import { ErrorBanner } from "../common/ErrorBanner";
import "./RatingList.css";

/**
 * Two-way ratings list with clear visual separation between:
 * Section A: Employer ratings of this worker
 * Section B: Worker ratings of this employer
 *
 * Each direction displays:
 * - Its own independent average rating & count
 * - Its own review cards with author, score, review text, date, and job
 * - Its own empty state
 * - Balanced 2-column layout on desktop, vertically stacked on mobile
 *
 * @param {{
 *   userId: string,
 *   ratingAvg?: number,
 *   ratingCount?: number,
 *   workerProfile?: object|null,
 *   employerProfile?: object|null,
 *   isWorker?: boolean,
 *   isEmployer?: boolean,
 *   activeTab?: string,
 * }} props
 */
export function RatingList({
  userId,
  ratingAvg,
  ratingCount,
  workerProfile,
  employerProfile,
  isWorker = true,
  isEmployer = false,
  activeTab = "worker",
}) {
  const { t } = useLanguage();
  const { data: ratings, loading, error } = useAsync(
    () => ratingsApi.getForUser(userId),
    { deps: [userId] }
  );

  const hasWorkerRole = isWorker || !!workerProfile;
  const hasEmployerRole = isEmployer || !!employerProfile;

  // Independent metrics for each direction
  const workerAvg =
    typeof workerProfile?.ratingAvg === "number"
      ? workerProfile.ratingAvg
      : activeTab === "worker" && typeof ratingAvg === "number"
      ? ratingAvg
      : undefined;

  const workerCount =
    typeof workerProfile?.ratingCount === "number"
      ? workerProfile.ratingCount
      : activeTab === "worker" && typeof ratingCount === "number"
      ? ratingCount
      : 0;

  const employerAvg =
    typeof employerProfile?.ratingAvg === "number"
      ? employerProfile.ratingAvg
      : activeTab === "employer" && typeof ratingAvg === "number"
      ? ratingAvg
      : undefined;

  const employerCount =
    typeof employerProfile?.ratingCount === "number"
      ? employerProfile.ratingCount
      : activeTab === "employer" && typeof ratingCount === "number"
      ? ratingCount
      : 0;

  // Separate reviews by target role without fabricating or mixing data
  const { workerReviews, employerReviews, uncategorizedReviews } = useMemo(() => {
    const list = Array.isArray(ratings) ? ratings : [];
    const workerList = [];
    const employerList = [];
    const uncategorizedList = [];

    list.forEach((item) => {
      if (item.targetRole === "worker") {
        workerList.push(item);
      } else if (item.targetRole === "employer") {
        employerList.push(item);
      } else if (hasWorkerRole && !hasEmployerRole) {
        // User only has worker profile: all reviews are for worker role
        workerList.push(item);
      } else if (hasEmployerRole && !hasWorkerRole) {
        // User only has employer profile: all reviews are for employer role
        employerList.push(item);
      } else {
        // Dual-role user with historical unclassified review
        if (activeTab === "employer") {
          employerList.push(item);
        } else {
          workerList.push(item);
        }
        uncategorizedList.push(item);
      }
    });

    return {
      workerReviews: workerList,
      employerReviews: employerList,
      uncategorizedReviews: uncategorizedList,
    };
  }, [ratings, hasWorkerRole, hasEmployerRole, activeTab]);

  if (loading) return <Spinner label={t("rating.loadingReviews")} />;
  if (error) return <ErrorBanner error={error} />;

  const renderReviewItem = (rating) => {
    const authorName =
      rating.fromUserId?.fullName ||
      rating.authorName ||
      (rating.targetRole === "employer"
        ? t("rating.workerRatingsSubtitle")
        : t("rating.employerRatingsSubtitle"));

    const dateFormatted = rating.createdAt
      ? new Date(rating.createdAt).toLocaleDateString()
      : null;

    return (
      <li key={rating._id} className="rating-item-card">
        <div className="rating-list-item-header">
          <div className="rating-author-info">
            {rating.fromUserId?.avatar ? (
              <img
                src={rating.fromUserId.avatar}
                alt=""
                className="rating-author-avatar"
              />
            ) : (
              <div className="rating-author-avatar placeholder" aria-hidden="true">
                <UserRound size={16} />
              </div>
            )}
            <div className="rating-author-meta">
              <span className="rating-author-name">{authorName}</span>
              {dateFormatted && (
                <span className="rating-list-date">{dateFormatted}</span>
              )}
            </div>
          </div>
          <RatingStars value={rating.rating} />
        </div>

        {rating.jobTitle && (
          <div className="rating-job-context">
            <Briefcase size={13} aria-hidden="true" />
            <span>{rating.jobTitle}</span>
          </div>
        )}

        {rating.review && (
          <p className="rating-review-text">{rating.review}</p>
        )}
      </li>
    );
  };

  return (
    <div className="rating-two-way-wrapper">
      <div className="rating-two-way-grid">
        {/* SECTION A: Employer ratings of this worker */}
        <section className="rating-direction-column worker-direction">
          <div className="rating-direction-header">
            <div className="rating-direction-badge worker">
              <HardHat size={18} aria-hidden="true" />
            </div>
            <div>
              <h3 className="rating-direction-title">
                {t("rating.employerRatingsOfWorker")}
              </h3>
              <p className="rating-direction-sub">
                {t("rating.employerRatingsSubtitle")}
              </p>
            </div>
          </div>

          <div className="rating-canonical-summary">
            <RatingStars
              value={typeof workerAvg === "number" ? workerAvg : 0}
              count={typeof workerCount === "number" ? workerCount : workerReviews.length}
            />
          </div>

          {!hasWorkerRole ? (
            <p className="rating-empty-muted">{t("rating.notAWorkerYet")}</p>
          ) : workerReviews.length === 0 ? (
            <p className="rating-list-empty">{t("rating.noEmployerReviews")}</p>
          ) : (
            <ul className="rating-list-items">
              {workerReviews.map(renderReviewItem)}
            </ul>
          )}
        </section>

        {/* SECTION B: Worker ratings of this employer */}
        <section className="rating-direction-column employer-direction">
          <div className="rating-direction-header">
            <div className="rating-direction-badge employer">
              <Building2 size={18} aria-hidden="true" />
            </div>
            <div>
              <h3 className="rating-direction-title">
                {t("rating.workerRatingsOfEmployer")}
              </h3>
              <p className="rating-direction-sub">
                {t("rating.workerRatingsSubtitle")}
              </p>
            </div>
          </div>

          <div className="rating-canonical-summary">
            <RatingStars
              value={typeof employerAvg === "number" ? employerAvg : 0}
              count={typeof employerCount === "number" ? employerCount : employerReviews.length}
            />
          </div>

          {!hasEmployerRole ? (
            <p className="rating-empty-muted">{t("rating.notAnEmployerYet")}</p>
          ) : employerReviews.length === 0 ? (
            <p className="rating-list-empty">{t("rating.noWorkerReviews")}</p>
          ) : (
            <ul className="rating-list-items">
              {employerReviews.map(renderReviewItem)}
            </ul>
          )}
        </section>
      </div>

      {uncategorizedReviews.length > 0 && hasWorkerRole && hasEmployerRole && (
        <p className="rating-transparency-note">
          {t("rating.uncategorizedNotice")}
        </p>
      )}
    </div>
  );
}

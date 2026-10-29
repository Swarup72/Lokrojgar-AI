import { useEffect } from "react";
import { Building2, X } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { RatingStars } from "../common/RatingStars";
import { RatingList } from "./RatingList";
import "./EmployerReviewsModal.css";

/**
 * Accessible modal displaying real employer reviews, rating summary, and ratings list.
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   employerName: string,
 *   userId?: string,
 *   employerProfile?: object|null,
 *   ratingAvg?: number,
 *   ratingCount?: number,
 * }} props
 */
export function EmployerReviewsModal({
  isOpen,
  onClose,
  employerName,
  userId,
  employerProfile,
  ratingAvg,
  ratingCount,
}) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="employer-reviews-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="employer-reviews-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employer-reviews-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="employer-reviews-modal-header">
          <div className="employer-reviews-modal-header-info">
            <div className="employer-reviews-modal-icon" aria-hidden="true">
              <Building2 size={24} />
            </div>
            <div className="employer-reviews-modal-titles">
              <h2 id="employer-reviews-modal-title">
                {employerName || t("reviews")}
              </h2>
              <div className="employer-reviews-modal-meta">
                <RatingStars
                  value={ratingAvg}
                  count={ratingCount}
                  compact={false}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            className="employer-reviews-modal-close"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="employer-reviews-modal-body">
          {userId ? (
            <RatingList
              userId={String(userId)}
              employerProfile={employerProfile}
              ratingAvg={ratingAvg}
              ratingCount={ratingCount}
              isEmployer={true}
              isWorker={false}
              activeTab="employer"
            />
          ) : (
            <p className="form-error">
              {t("rating.noWorkerReviews")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

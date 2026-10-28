import { Star } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import "./RatingStars.css";

/**
 * The ONE canonical worker/employer rating display.
 *
 * `value` is always `ratingAvg` and `count` always `ratingCount`, from the
 * WorkerProfile/EmployerProfile aggregate the Ratings module maintains. There is
 * no second rating field anywhere in the schema, and this component must never
 * be fed the recommendation "rating" MATCH FACTOR, which is a 0-100
 * compatibility percentage, not a star rating.
 *
 * NEVER-RATED is shown as "Not rated yet", not as "0.0". `ratingAvg` defaults to
 * 0 for someone who has never been rated, but every individual rating is
 * constrained to 1-5, so an average of 0 is mathematically impossible as a real
 * figure - it can only mean "no ratings". Printing it as "0.0" read as a
 * zero-star review of a brand-new worker, which is both wrong and unfair. (The
 * AI service draws the same distinction, in matching/rating_match.py.)
 *
 * @param {{value?: number, count?: number, compact?: boolean}} props
 */
export function RatingStars({ value = 0, count, compact = false }) {
  const { t } = useLanguage();
  const hasRatings = typeof count === "number" ? count > 0 : value > 0;

  if (!hasRatings) {
    return (
      <span className="rating-stars rating-stars-unrated" title={t("rating.notRatedTitle")}>
        <Star size={16} aria-hidden="true" />
        <span className="rating-stars-unrated-text">{compact ? t("rating.new") : t("rating.notRated")}</span>
      </span>
    );
  }

  const rounded = Math.round(value);

  return (
    <span className="rating-stars" aria-label={t("rating.starsAria", { value: value.toFixed(1), count: count ?? 0 })}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={16} aria-hidden="true" className={star <= rounded ? "filled" : ""} />
      ))}
      <span className="rating-stars-value">{value.toFixed(1)}</span>
      {typeof count === "number" && <span className="rating-stars-count">({count})</span>}
    </span>
  );
}

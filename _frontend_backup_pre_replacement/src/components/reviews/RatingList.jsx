import { useAsync } from "../../hooks/useAsync";
import { useLanguage } from "../../hooks/useLanguage";
import * as ratingsApi from "../../api/ratings";
import { RatingStars } from "../common/RatingStars";
import { Spinner } from "../common/Spinner";
import { ErrorBanner } from "../common/ErrorBanner";
import "./RatingList.css";

/**
 * Read-only list of the ratings someone has received.
 *
 * The summary at the top shows the CANONICAL aggregate - `ratingAvg` /
 * `ratingCount` from the profile, which the backend maintains atomically -
 * rather than an average this component recomputes from the fetched list.
 * Recomputing here was a second source of truth for the same number: the two
 * agreed only as long as the list was complete and the aggregate was correct,
 * and a disagreement would show the same person two different ratings on two
 * different screens. The list below is the evidence; the aggregate is the value.
 *
 * @param {{userId: string, ratingAvg?: number, ratingCount?: number}} props
 */
export function RatingList({ userId, ratingAvg, ratingCount }) {
  const { t } = useLanguage();
  const { data: ratings, loading, error } = useAsync(() => ratingsApi.getForUser(userId), { deps: [userId] });

  if (loading) return <Spinner label={t("rating.loadingReviews")} />;
  if (error) return <ErrorBanner error={error} />;

  return (
    <div className="rating-list">
      {/* Falls back to the fetched list's own length only when the caller did
          not pass the profile aggregate, so the component still works for a
          user whose profile is not to hand. */}
      <RatingStars
        value={typeof ratingAvg === "number" ? ratingAvg : 0}
        count={typeof ratingCount === "number" ? ratingCount : ratings.length}
      />

      {ratings.length === 0 && <p className="rating-list-empty">{t("rating.noReviews")}</p>}

      <ul className="rating-list-items">
        {ratings.map((rating) => (
          <li key={rating._id}>
            <div className="rating-list-item-header">
              <RatingStars value={rating.rating} />
              <span className="rating-list-date">{new Date(rating.createdAt).toLocaleDateString()}</span>
            </div>
            {rating.review && <p>{rating.review}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

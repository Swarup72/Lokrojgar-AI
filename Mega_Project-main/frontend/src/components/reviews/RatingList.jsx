import { useMemo } from "react";
import { useAsync } from "../../hooks/useAsync";
import * as ratingsApi from "../../api/ratings";
import { RatingStars } from "../common/RatingStars";
import { Spinner } from "../common/Spinner";
import { ErrorBanner } from "../common/ErrorBanner";
import "./RatingList.css";

/** Read-only list of ratings received by `userId`, with an average summary. */
export function RatingList({ userId }) {
  const { data: ratings, loading, error } = useAsync(() => ratingsApi.getForUser(userId), { deps: [userId] });

  const average = useMemo(() => {
    if (!ratings?.length) return 0;
    return ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
  }, [ratings]);

  if (loading) return <Spinner label="Loading reviews..." />;
  if (error) return <ErrorBanner error={error} />;

  return (
    <div className="rating-list">
      <RatingStars value={average} count={ratings.length} />

      {ratings.length === 0 && <p className="rating-list-empty">No reviews yet.</p>}

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

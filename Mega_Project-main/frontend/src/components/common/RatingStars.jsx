import { Star } from "lucide-react";
import "./RatingStars.css";

/** Read-only star display. @param {{value: number, count?: number}} props */
export function RatingStars({ value = 0, count }) {
  const rounded = Math.round(value);

  return (
    <span className="rating-stars" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={16} aria-hidden="true" className={star <= rounded ? "filled" : ""} />
      ))}
      <span className="rating-stars-value">{value.toFixed(1)}</span>
      {typeof count === "number" && <span className="rating-stars-count">({count})</span>}
    </span>
  );
}

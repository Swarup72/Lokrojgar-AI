import { useState } from "react";
import { Star } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import "./RatingForm.css";

// Mirrors MAX_REVIEW_LENGTH in backend2/src/validators/rating.validator.js.
// Enforced here too so an over-long review is impossible to submit rather
// than bouncing back as a 400 after the user has written it.
export const MAX_REVIEW_LENGTH = 1000;

/** @param {{onSubmit: (payload:{score:number, review?:string}) => Promise<void>, submitting: boolean}} props */
export function RatingForm({ onSubmit, submitting }) {
  const { t } = useLanguage();
  const [score, setScore] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [review, setReview] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (score === 0) return;
    // score comes only from the five buttons, so it is always a whole
    // 1-5 star - the backend rejects anything else (fractional included).
    onSubmit({ score, review: review || undefined });
  };

  return (
    <form className="rating-form" onSubmit={handleSubmit}>
      <div className="rating-form-stars">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setScore(value)}
            onMouseEnter={() => setHovered(value)}
            onMouseLeave={() => setHovered(0)}
            aria-label={t("rating.starAria", { count: value })}
          >
            <Star size={22} className={value <= (hovered || score) ? "filled" : ""} aria-hidden="true" />
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        maxLength={MAX_REVIEW_LENGTH}
        placeholder={t("rating.commentPlaceholder")}
        value={review}
        onChange={(event) => setReview(event.target.value)}
      />
      <button type="submit" className="btn btn-primary" disabled={score === 0 || submitting}>
        {submitting ? t("rating.submitting") : t("rating.submit")}
      </button>
    </form>
  );
}

import { useState } from "react";
import { Star } from "lucide-react";
import "./RatingForm.css";

/** @param {{onSubmit: (payload:{score:number, review?:string}) => Promise<void>, submitting: boolean}} props */
export function RatingForm({ onSubmit, submitting }) {
  const [score, setScore] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [review, setReview] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (score === 0) return;
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
            aria-label={`${value} star${value > 1 ? "s" : ""}`}
          >
            <Star size={22} className={value <= (hovered || score) ? "filled" : ""} aria-hidden="true" />
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        placeholder="Leave a comment (optional)"
        value={review}
        onChange={(event) => setReview(event.target.value)}
      />
      <button type="submit" className="btn btn-primary" disabled={score === 0 || submitting}>
        {submitting ? "Submitting..." : "Submit rating"}
      </button>
    </form>
  );
}

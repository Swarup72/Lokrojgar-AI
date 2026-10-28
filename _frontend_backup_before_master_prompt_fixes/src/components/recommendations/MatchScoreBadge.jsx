import "./MatchScoreBadge.css";

/** @param {{score: number|null}} props */
export function MatchScoreBadge({ score }) {
  if (score === null || score === undefined) return null;

  const level = score >= 75 ? "high" : score >= 50 ? "medium" : "low";

  return (
    <span className={`match-score-badge match-score-${level}`}>
      Match: {Math.round(score)}%
    </span>
  );
}

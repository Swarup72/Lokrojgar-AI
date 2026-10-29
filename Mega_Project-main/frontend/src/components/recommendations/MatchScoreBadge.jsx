import { useLanguage } from "../../hooks/useLanguage";
import { normalizeMatchScore } from "../../utils/matchDisplay";
import "./MatchScoreBadge.css";

/**
 * @param {{score: number|null|undefined, showUnavailable?: boolean}} props
 * `score` is the backend's 0-100 overall score. A missing score renders nothing
 * unless `showUnavailable` is set (recommendation context); a present but
 * invalid score always renders the localized "unavailable" indicator.
 */
export function MatchScoreBadge({ score, showUnavailable = false }) {
  const { t } = useLanguage();
  const missing = score === null || score === undefined;
  if (missing && !showUnavailable) return null;

  const value = normalizeMatchScore(score);

  if (value === null) {
    return (
      <span className="match-score-badge match-score-unavailable">
        {t("match.scoreUnavailable")}
      </span>
    );
  }

  const level = value >= 75 ? "high" : value >= 50 ? "medium" : "low";

  return (
    <span
      className={`match-score-badge match-score-${level}`}
      aria-label={t("match.scoreAria", { score: value })}
    >
      <span className="match-score-text" aria-hidden="true">
        {t("applications.matchScoreBadge", { score: value })}
      </span>
      <span className="match-score-bar" aria-hidden="true">
        <span className="match-score-bar-fill" style={{ width: `${value}%` }} />
      </span>
    </span>
  );
}

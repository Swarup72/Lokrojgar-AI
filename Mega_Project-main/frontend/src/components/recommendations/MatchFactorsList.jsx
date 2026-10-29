import { Check, Minus, Info } from "lucide-react";
import { MATCH_FACTOR_ORDER } from "../../utils/enums";
import { useLanguage } from "../../hooks/useLanguage";
import "./MatchFactorsList.css";

/**
 * These label the six MATCH FACTORS - how well this pair fits on each axis,
 * 0-100. They are NOT the person's star rating.
 *
 * "rating" is deliberately labelled "Reputation fit" rather than "Rating": the
 * old label sat directly beside the real star rating on the same card, so a
 * brand-new worker appeared to have two different, contradictory ratings. The
 * stars (RatingStars) are the canonical reputation; this row only says whether
 * reputation could be used as a matching signal for this pair.
 */
const LABEL_KEYS = {
  skill: "match.skill",
  location: "common.location",
  availability: "voice.guided.availability.label",
  pay: "match.pay",
  rating: "match.reputationFit",
  relevance: "match.relevance",
};

/**
 * Shows which match factors could be evaluated for this pair, purely from
 * matchFactors' null-vs-non-null state (the AI service's own richer
 * per-factor explanation text is computed but never reaches this app - see
 * job.controller.js). A dash means "not available for this pair" (e.g. pay
 * is always unavailable - no worker-side pay unit; rating is unavailable
 * for a worker who hasn't been rated yet) - it is never a claim that the
 * match is bad.
 * @param {{matchFactors: Record<string, number|null>}} props
 */
export function MatchFactorsList({ matchFactors, explanation, showSummary = true }) {
  const { t } = useLanguage();
  if (!matchFactors) return null;

  return (
    <div className="match-factors-container">
      <ul className="match-factors-list">
        {MATCH_FACTOR_ORDER.map((factor) => {
          const factorVal = matchFactors[factor];
          const available = factorVal !== null && factorVal !== undefined;
          const factorExp = explanation?.factors?.find((f) => f.factor === factor);
          const label = t(LABEL_KEYS[factor]);
          const tooltip =
            factorExp?.summary ||
            (available
              ? t("match.tooltipAvailable", { factor: label, percent: Math.round(factorVal) })
              : factor === "rating"
                ? t("match.notRatedSignal")
                : t("match.tooltipUnavailable", { factor: label }));

          return (
            <li
              key={factor}
              className={available ? "available" : "unavailable"}
              title={tooltip}
            >
              {available ? <Check size={13} aria-hidden="true" /> : <Minus size={13} aria-hidden="true" />}
              <span>
                {label}
                {available && typeof factorVal === "number" ? ` (${Math.round(factorVal)}%)` : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {showSummary && explanation?.summary && (
        <p className="match-factors-summary">{explanation.summary}</p>
      )}
      {matchFactors.skill === 0 && (
        <p className="match-skill-zero-note">
          <Info size={13} aria-hidden="true" />
          <span>{t("recommendations.skillsPrioritizedNotice")}</span>
        </p>
      )}
    </div>
  );
}


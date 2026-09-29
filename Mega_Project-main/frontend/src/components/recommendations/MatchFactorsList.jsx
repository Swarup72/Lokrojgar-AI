import { Check, Minus } from "lucide-react";
import { MATCH_FACTOR_ORDER } from "../../utils/enums";
import "./MatchFactorsList.css";

const LABELS = {
  skill: "Skill",
  location: "Location",
  availability: "Availability",
  pay: "Pay",
  rating: "Rating",
  relevance: "Relevance",
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
export function MatchFactorsList({ matchFactors }) {
  if (!matchFactors) return null;

  return (
    <ul className="match-factors-list">
      {MATCH_FACTOR_ORDER.map((factor) => {
        const available = matchFactors[factor] !== null && matchFactors[factor] !== undefined;
        return (
          <li key={factor} className={available ? "available" : "unavailable"}>
            {available ? <Check size={13} aria-hidden="true" /> : <Minus size={13} aria-hidden="true" />}
            <span>{LABELS[factor]}</span>
          </li>
        );
      })}
    </ul>
  );
}

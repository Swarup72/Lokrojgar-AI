import { Search, Navigation } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { PAY_TYPES } from "../../utils/enums";
import "./JobFilters.css";

/**
 * @param {{mode:"search"|"nearby", onModeChange:(m:string)=>void, filters:object, onFilterChange:(f:object)=>void, categories:object[]}} props
 */
export function JobFilters({ mode, onModeChange, filters, onFilterChange, categories }) {
  const { language } = useLanguage();

  const update = (key, value) => onFilterChange({ ...filters, [key]: value || undefined });

  return (
    <div className="job-filters">
      <div className="job-filters-mode">
        <button type="button" className={mode === "search" ? "active" : ""} onClick={() => onModeChange("search")}>
          <Search size={15} aria-hidden="true" /> Search
        </button>
        <button type="button" className={mode === "nearby" ? "active" : ""} onClick={() => onModeChange("nearby")}>
          <Navigation size={15} aria-hidden="true" /> Near me
        </button>
      </div>

      {mode === "search" && (
        <div className="job-filters-fields">
          <select value={filters.categoryId || ""} onChange={(event) => update("categoryId", event.target.value)}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {pickLocalizedText(category.nameMultilingual, language) || category.name}
              </option>
            ))}
          </select>

          <select value={filters.payType || ""} onChange={(event) => update("payType", event.target.value)}>
            <option value="">Any pay type</option>
            {PAY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="0"
            placeholder="Min pay (₹)"
            value={filters.minPay || ""}
            onChange={(event) => update("minPay", event.target.value)}
          />
        </div>
      )}
    </div>
  );
}

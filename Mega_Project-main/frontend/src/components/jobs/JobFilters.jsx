import { Search, Navigation, RotateCcw } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { PAY_TYPES } from "../../utils/enums";
import { PAY_TYPE_KEYS } from "../../utils/enumLabels";
import "./JobFilters.css";

/**
 * @param {{mode:"search"|"nearby", onModeChange:(m:string)=>void, filters:object, onFilterChange:(f:object)=>void, categories:object[]}} props
 */
export function JobFilters({ mode, onModeChange, filters, onFilterChange, categories }) {
  const { language, t } = useLanguage();

  const update = (key, value) => onFilterChange({ ...filters, [key]: value || undefined });

  const hasActiveFilters = Boolean(filters.categoryId || filters.payType || filters.minPay);

  const handleClearFilters = () => {
    onFilterChange({
      ...filters,
      categoryId: undefined,
      payType: undefined,
      minPay: undefined,
    });
  };

  return (
    <div className="job-filters">
      <div className="job-filters-mode">
        <button
          type="button"
          className={mode === "search" ? "active" : ""}
          onClick={() => onModeChange("search")}
        >
          <Search size={15} aria-hidden="true" /> {t("common.search")}
        </button>
        <button
          type="button"
          className={mode === "nearby" ? "active" : ""}
          onClick={() => onModeChange("nearby")}
        >
          <Navigation size={15} aria-hidden="true" /> {t("jobs.search.nearMe")}
        </button>
      </div>

      {mode === "search" && (
        <div className="job-filters-fields">
          <select
            value={filters.categoryId || ""}
            onChange={(event) => update("categoryId", event.target.value)}
            aria-label={t("jobs.search.allCategories")}
          >
            <option value="">{t("jobs.search.allCategories")}</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {pickLocalizedText(category.nameMultilingual, language) || category.name}
              </option>
            ))}
          </select>

          <select
            value={filters.payType || ""}
            onChange={(event) => update("payType", event.target.value)}
            aria-label={t("jobs.search.anyPayType")}
          >
            <option value="">{t("jobs.search.anyPayType")}</option>
            {PAY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(PAY_TYPE_KEYS[type])}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="0"
            placeholder={t("jobs.search.minPay")}
            value={filters.minPay || ""}
            onChange={(event) => update("minPay", event.target.value)}
            aria-label={t("jobs.search.minPay")}
          />

          {hasActiveFilters && (
            <button
              type="button"
              className="job-filters-clear-btn"
              onClick={handleClearFilters}
              title={t("jobs.search.clearFilters")}
            >
              <RotateCcw size={13} aria-hidden="true" />
              <span>{t("jobs.search.clearFilters")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

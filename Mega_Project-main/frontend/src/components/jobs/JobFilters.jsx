import { Search, Navigation, RotateCcw, ShieldCheck } from "lucide-react";
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

  const hasActiveFilters = Boolean(
    filters.categoryId ||
    filters.payType ||
    filters.minPay ||
    filters.maxPay ||
    filters.city ||
    filters.verifiedOnly
  );

  const handleClearFilters = () => {
    onFilterChange({
      ...filters,
      categoryId: undefined,
      payType: undefined,
      minPay: undefined,
      maxPay: undefined,
      city: undefined,
      verifiedOnly: undefined,
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
            type="text"
            placeholder={t("jobs.search.city")}
            value={filters.city || ""}
            onChange={(event) => update("city", event.target.value)}
            aria-label={t("jobs.search.city")}
            className="job-filter-city-input"
          />

          <div className="job-filter-wage-wrap">
            <span className="job-filter-wage-prefix" aria-hidden="true">₹</span>
            <input
              type="number"
              min="0"
              placeholder={t("jobs.search.minPay")}
              value={filters.minPay || ""}
              onChange={(event) => update("minPay", event.target.value)}
              aria-label={t("jobs.search.minPay")}
            />
          </div>

          <div className="job-filter-wage-wrap">
            <span className="job-filter-wage-prefix" aria-hidden="true">₹</span>
            <input
              type="number"
              min="0"
              placeholder={t("jobs.search.maxPay")}
              value={filters.maxPay || ""}
              onChange={(event) => update("maxPay", event.target.value)}
              aria-label={t("jobs.search.maxPay")}
            />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={Boolean(filters.verifiedOnly)}
            className={`job-filter-toggle ${filters.verifiedOnly ? "active" : ""}`}
            onClick={() => update("verifiedOnly", !filters.verifiedOnly)}
            title={t("jobs.search.verifiedEmployer")}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            <span>{t("jobs.search.verifiedEmployer")}</span>
          </button>

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

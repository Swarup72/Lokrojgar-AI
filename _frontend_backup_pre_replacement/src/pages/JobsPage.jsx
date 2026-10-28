import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Briefcase } from "lucide-react";
import * as jobsApi from "../api/jobs";
import * as catalogApi from "../api/catalog";
import { normalizeError } from "../api/client";
import { useGeolocation } from "../hooks/useGeolocation";
import { useLanguage } from "../hooks/useLanguage";
import { JobCard } from "../components/jobs/JobCard";
import { JobFilters } from "../components/jobs/JobFilters";
import { Pagination } from "../components/common/Pagination";
import { Spinner } from "../components/common/Spinner";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorBanner } from "../components/common/ErrorBanner";
import "./JobsPage.css";

export function JobsPage() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("query");
  const initialLocation = searchParams.get("location");

  const [mode, setMode] = useState("search");
  const [filters, setFilters] = useState({
    page: 1,
    ...(initialQuery ? { query: initialQuery } : {}),
    ...(initialLocation ? { city: initialLocation } : {}),
  });
  const [categories, setCategories] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { requestLocation, status: geoStatus } = useGeolocation();

  useEffect(() => {
    catalogApi.getCategories().then(setCategories).catch(() => {});
  }, []);

  const categoriesById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category._id, category])),
    [categories]
  );

  const loadSearch = async (nextFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await jobsApi.search(nextFilters);
      setResult(data);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  const loadNearby = async () => {
    setLoading(true);
    setError(null);
    try {
      const { longitude, latitude } = await requestLocation();
      const jobs = await jobsApi.nearby({ longitude, latitude, radiusKm: 20 });
      setResult(jobs);
    } catch (err) {
      setError(err.isNetworkError !== undefined ? err : normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "search") {
      loadSearch(filters);
    } else {
      loadNearby();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, filters]);

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setResult(null);
  };

  const jobs = mode === "search" ? result?.docs || [] : result || [];

  return (
    <div className="container jobs-page page-animate">
      <div className="jobs-header">
        <h1 className="jobs-page-title">{t("findJobs")}</h1>
        <p className="jobs-header-desc">{t("homeDescription")}</p>
      </div>

      <JobFilters
        mode={mode}
        onModeChange={handleModeChange}
        filters={filters}
        onFilterChange={(next) => setFilters({ ...next, page: 1 })}
        categories={categories}
      />

      {loading && (
        <div className="jobs-page-loading">
          <Spinner
            label={
              mode === "nearby" && geoStatus === "requesting"
                ? t("jobs.gettingLocation")
                : t("jobs.loading")
            }
          />
        </div>
      )}

      {!loading && error && (
        <ErrorBanner error={error} onRetry={() => (mode === "search" ? loadSearch(filters) : loadNearby())} />
      )}

      {!loading && !error && jobs.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title={t("jobs.search.noResults")}
          description={t("jobs.search.noResultsDesc")}
        />
      )}

      {!loading && !error && jobs.length > 0 && (
        <div className="jobs-list">
          {jobs.map((job) => (
            <JobCard key={job._id} job={job} categoriesById={categoriesById} />
          ))}
        </div>
      )}

      {mode === "search" && result && !loading && !error && (
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          hasPrevPage={result.hasPrevPage}
          hasNextPage={result.hasNextPage}
          onPageChange={(page) => setFilters({ ...filters, page })}
        />
      )}
    </div>
  );
}

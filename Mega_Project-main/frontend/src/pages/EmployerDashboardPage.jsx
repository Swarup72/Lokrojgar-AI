import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { PlusCircle, Briefcase, Eye } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAsync } from "../hooks/useAsync";
import { PAY_TYPE_KEYS } from "../utils/enumLabels";
import { useLanguage } from "../hooks/useLanguage";
import * as jobsApi from "../api/jobs";
import { pickLocalizedText } from "../utils/localizedText";
import { Card } from "../components/common/Card";
import { StatusPill } from "../components/common/StatusPill";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import { JobStatusActions } from "../components/jobs/JobStatusActions";
import "./EmployerDashboardPage.css";
import { ownEmployerName } from "../utils/displayName";

export function EmployerDashboardPage() {
  const { user, employerProfile } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeFilter, setActiveFilter] = useState("all");

  const { data: jobs, loading, error, run: refetchJobs } = useAsync(jobsApi.getEmployerMine);

  const filterJobs = (list) => {
    if (!list) return [];
    if (activeFilter === "active") {
      return list.filter((j) => j.status === "open" || j.status === "partially_assigned");
    }
    if (activeFilter === "draft") {
      return list.filter((j) => j.status === "draft");
    }
    if (activeFilter === "closed") {
      return list.filter(
        (j) =>
          j.status === "completed" ||
          j.status === "cancelled" ||
          j.status === "expired" ||
          j.status === "assigned"
      );
    }
    return list;
  };

  const filteredJobs = filterJobs(jobs);

  const tabs = [
    { id: "all", label: t("common.all") },
    { id: "active", label: t("common.active") },
    { id: "draft", label: t("tabs.draft") },
    { id: "closed", label: t("tabs.closed") },
  ];

  return (
    <div className="container employer-dashboard page-animate">
      {location.state?.message && (
        <div
          style={{
            background: "var(--color-success-bg, #ecfdf5)",
            color: "var(--color-success-text, #065f46)",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            marginBottom: 20,
            fontSize: "var(--text-sm)",
            fontWeight: 500,
          }}
        >
          {location.state.message}
        </div>
      )}

      <div className="employer-dashboard-header">
        <h1>{t("dashboard.greeting", { name: ownEmployerName(employerProfile, user) || "there" })}</h1>
        <p className="employer-dashboard-sub">{t("dashboard.employerSubtitle")}</p>
      </div>

      <div className="employer-dashboard-actions">
        <Link to="/post-job" className="btn btn-primary visual-action-btn animated-button">
          <PlusCircle size={18} aria-hidden="true" />
          <span>{t("postJob")}</span>
        </Link>
        <Link to="/profile" className="btn btn-secondary visual-action-btn">
          <span>{t("profile")}</span>
        </Link>
      </div>

      <section className="employer-dashboard-section">
        <div className="employer-section-heading">
          <h2>{t("myJobs")} ({jobs?.length || 0})</h2>

          <div className="employer-filter-tabs">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`employer-filter-tab ${activeFilter === tab.id ? "active" : ""}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <Spinner label={t("loadingJobs")} />}
        {!loading && error && <ErrorBanner error={error} onRetry={refetchJobs} />}

        {!loading && !error && jobs?.length === 0 && (
          <EmptyState
            icon={Briefcase}
            title={t("employer.dashboard.noJobs")}
            description={t("postJobPromptDesc")}
            action={<Link to="/post-job">{t("postJob")}</Link>}
          />
        )}

        {!loading && !error && jobs?.length > 0 && filteredJobs.length === 0 && (
          <p style={{ color: "var(--color-muted)", fontSize: "var(--text-sm)", padding: "20px 0" }}>
            {t("noJobsMatchFilter", { filter: activeFilter })}
          </p>
        )}

        {!loading && !error && filteredJobs.length > 0 && (
          <div className="employer-job-list">
            {filteredJobs.map((job) => {
              const title = pickLocalizedText(job.title, language, job.originalLanguage);
              const category = job.categoryId;
              const categoryName =
                typeof category === "object"
                  ? pickLocalizedText(category.nameMultilingual || category.name, language) ||
                    category.name
                  : null;

              return (
                <Card key={job._id} className="employer-job-card animated-card">
                  <div className="employer-job-card-header">
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Link
                          to={`/jobs/${job._id}`}
                          state={{ job }}
                          style={{
                            textDecoration: "none",
                            color: "inherit",
                          }}
                        >
                          <h3 style={{ margin: 0, fontSize: "17px", color: "var(--color-ink)" }}>{title || "Untitled job"}</h3>
                        </Link>
                      </div>
                      <p style={{ marginTop: 6, color: "var(--color-muted)", fontSize: "14px" }}>
                        {categoryName ? `${categoryName} · ` : ""}
                        {job.city ? `${job.city} · ` : ""}₹{job.payAmount} / {t(PAY_TYPE_KEYS[job.payType] ?? job.payType)} ·{" "}
                        <strong>
                          {job.filledWorkers || 0}/{job.requiredWorkers}
                        </strong>{" "}
                        {t("workersHired")}
                      </p>
                    </div>
                    <StatusPill status={job.status} />
                  </div>

                  <div className="employer-job-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => navigate(`/jobs/${job._id}`, { state: { job } })}
                      style={{ padding: "8px 14px", fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <Eye size={15} aria-hidden="true" /> <span>{t("common.viewDetails")}</span>
                    </button>
                    {/* The Applicants action lives in <JobStatusActions> below,
                        alongside the other per-job actions. The duplicate that
                        used to sit here pointed at /jobs/:id/applicants, which
                        is not a registered route - the real one is
                        /applicants/:jobId - so it rendered the Not Found page. */}
                    <JobStatusActions job={job} onActionCompleted={refetchJobs} compact />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { PlusCircle, Briefcase, Eye } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAsync } from "../hooks/useAsync";
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
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeFilter, setActiveFilter] = useState("all"); // "all" | "active" | "draft" | "closed"

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

  return (
    <div className="container employer-dashboard">
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

      <h1>Hello, {ownEmployerName(employerProfile, user) || "there"}</h1>

      <div className="employer-dashboard-actions">
        <Link to="/post-job" className="btn btn-primary">
          <PlusCircle size={17} aria-hidden="true" /> Post New Job
        </Link>
        <Link to="/profile" className="btn btn-secondary">
          View Profile
        </Link>
      </div>

      <section className="employer-dashboard-section">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <h2>My Jobs ({jobs?.length || 0})</h2>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All" },
              { id: "active", label: "Active" },
              { id: "draft", label: "Drafts" },
              { id: "closed", label: "Closed / Inactive" },
            ].map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-pill, 9999px)",
                  border: "1px solid var(--color-border)",
                  background: activeFilter === tab.id ? "var(--color-primary)" : "var(--color-surface)",
                  color: activeFilter === tab.id ? "#ffffff" : "var(--color-text)",
                  fontSize: "var(--text-xs)",
                  cursor: "pointer",
                  fontWeight: activeFilter === tab.id ? 600 : 400,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <Spinner label="Loading your jobs..." />}
        {!loading && error && <ErrorBanner error={error} onRetry={refetchJobs} />}

        {!loading && !error && jobs?.length === 0 && (
          <EmptyState
            icon={Briefcase}
            title="You haven't posted any jobs yet"
            description="Post a job to start receiving applicants from local workers."
            action={<Link to="/post-job">Post your first job</Link>}
          />
        )}

        {!loading && !error && jobs?.length > 0 && filteredJobs.length === 0 && (
          <p style={{ color: "var(--color-muted)", fontSize: "var(--text-sm)", padding: "20px 0" }}>
            No jobs match the '{activeFilter}' filter.
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
                <Card key={job._id} className="employer-job-card">
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
                          <h3 style={{ margin: 0 }}>{title || "Untitled job"}</h3>
                        </Link>
                      </div>
                      <p style={{ marginTop: 4 }}>
                        {categoryName ? `${categoryName} · ` : ""}
                        {job.city ? `${job.city} · ` : ""}₹{job.payAmount} / {job.payType} ·{" "}
                        <strong>
                          {job.filledWorkers || 0}/{job.requiredWorkers}
                        </strong>{" "}
                        workers hired
                      </p>
                    </div>
                    <StatusPill status={job.status} />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => navigate(`/jobs/${job._id}`, { state: { job } })}
                      style={{ padding: "8px 14px", fontSize: "var(--text-xs)" }}
                    >
                      <Eye size={15} aria-hidden="true" /> View Details
                    </button>
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

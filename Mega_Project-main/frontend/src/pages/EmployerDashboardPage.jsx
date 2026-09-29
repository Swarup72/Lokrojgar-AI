import { Link, useNavigate } from "react-router-dom";
import { PlusCircle, Users, Sparkles, Briefcase, XCircle, CheckCircle } from "lucide-react";
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
import "./EmployerDashboardPage.css";

export function EmployerDashboardPage() {
  const { employerProfile } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();

  const { data: jobs, loading, error, run: refetchJobs } = useAsync(jobsApi.getEmployerMine);

  const handleCancel = async (jobId) => {
    await jobsApi.cancel(jobId);
    refetchJobs();
  };

  const handleClose = async (jobId) => {
    await jobsApi.close(jobId);
    refetchJobs();
  };

  return (
    <div className="container employer-dashboard">
      <h1>Hello, {employerProfile?.businessName || "Employer"}</h1>

      <div className="employer-dashboard-actions">
        <Link to="/post-job" className="btn btn-primary">
          <PlusCircle size={17} aria-hidden="true" /> Post Job
        </Link>
        <Link to="/profile" className="btn btn-secondary">
          View Profile
        </Link>
      </div>

      <section className="employer-dashboard-section">
        <h2>My Jobs</h2>

        {loading && <Spinner label="Loading your jobs..." />}
        {!loading && error && <ErrorBanner error={error} onRetry={refetchJobs} />}

        {!loading && !error && jobs?.length === 0 && (
          <EmptyState
            icon={Briefcase}
            title="You haven't posted any jobs yet"
            description="Post a job to start receiving applicants."
            action={<Link to="/post-job">Post your first job</Link>}
          />
        )}

        {!loading && !error && jobs?.length > 0 && (
          <div className="employer-job-list">
            {jobs.map((job) => {
              const title = pickLocalizedText(job.title, language, job.originalLanguage);
              return (
                <Card key={job._id} className="employer-job-card">
                  <div className="employer-job-card-header">
                    <div>
                      <h3>{title || "Untitled job"}</h3>
                      <p>
                        {job.city ? `${job.city} · ` : ""}₹{job.payAmount} / {job.payType} · {job.filledWorkers}/
                        {job.requiredWorkers} filled
                      </p>
                    </div>
                    <StatusPill status={job.status} />
                  </div>
                  <div className="employer-job-card-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(`/applicants/${job._id}`, { state: { job } })}>
                      <Users size={15} aria-hidden="true" /> Applicants
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => navigate(`/jobs/${job._id}/recommended-workers`, { state: { job } })}
                    >
                      <Sparkles size={15} aria-hidden="true" /> Recommended Workers
                    </button>
                    {job.status === "open" || job.status === "partially_assigned" ? (
                      <>
                        <button type="button" className="btn btn-secondary" onClick={() => handleClose(job._id)}>
                          <CheckCircle size={15} aria-hidden="true" /> Close
                        </button>
                        <button type="button" className="btn btn-danger" onClick={() => handleCancel(job._id)}>
                          <XCircle size={15} aria-hidden="true" /> Cancel
                        </button>
                      </>
                    ) : null}
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

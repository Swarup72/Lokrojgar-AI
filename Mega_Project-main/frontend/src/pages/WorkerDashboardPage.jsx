import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Mic, Search, User, FileText, Briefcase } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAsync } from "../hooks/useAsync";
import * as recommendationsApi from "../api/recommendations";
import * as applicationsApi from "../api/applications";
import { JobCard } from "../components/jobs/JobCard";
import { Card } from "../components/common/Card";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import { StatusPill } from "../components/common/StatusPill";
import "./WorkerDashboardPage.css";

const PROFILE_FIELDS = ["fullName", "city", "expectedPay", "experienceYears"];

function computeProfileCompletion(profile) {
  if (!profile) return 0;
  const filled = PROFILE_FIELDS.filter((field) => Boolean(profile[field])).length;
  const hasBio = Object.values(profile.bio || {}).some(Boolean);
  const hasLanguages = (profile.languages || []).length > 0;
  const total = PROFILE_FIELDS.length + 2;
  const done = filled + (hasBio ? 1 : 0) + (hasLanguages ? 1 : 0);
  return Math.round((done / total) * 100);
}

export function WorkerDashboardPage() {
  const { user, workerProfile } = useAuth();
  const [appliedJobIds, setAppliedJobIds] = useState(new Set());
  const [applyError, setApplyError] = useState(null);

  const { data: recommended, loading: loadingRecommended, error: recommendedError } = useAsync(
    recommendationsApi.getRecommendedJobs
  );
  const { data: applications, loading: loadingApplications, run: refetchApplications } = useAsync(
    applicationsApi.getMine
  );

  const completion = useMemo(() => computeProfileCompletion(workerProfile), [workerProfile]);
  const recentApplications = applications?.slice(0, 5) || [];

  const handleApply = async (jobId) => {
    setApplyError(null);
    try {
      await applicationsApi.apply({ jobId });
      setAppliedJobIds((prev) => new Set(prev).add(jobId));
      refetchApplications().catch(() => {});
    } catch (err) {
      setApplyError(err);
    }
  };

  return (
    <div className="container worker-dashboard">
      <h1>Hello, {workerProfile?.fullName || user?.phone}</h1>

      {workerProfile && (
        <div className="worker-dashboard-completion">
          <div className="worker-dashboard-completion-bar">
            <div style={{ width: `${completion}%` }} />
          </div>
          <span>{completion}% profile complete</span>
        </div>
      )}

      <div className="worker-dashboard-actions">
        <Link to="/voice-profile" className="btn btn-primary">
          <Mic size={17} aria-hidden="true" /> Create Profile with Voice
        </Link>
        <Link to="/jobs" className="btn btn-secondary">
          <Search size={17} aria-hidden="true" /> Find Jobs
        </Link>
        <Link to="/profile" className="btn btn-secondary">
          <User size={17} aria-hidden="true" /> View Profile
        </Link>
        <Link to="/applications" className="btn btn-secondary">
          <FileText size={17} aria-hidden="true" /> My Applications
        </Link>
      </div>

      <section className="worker-dashboard-section">
        <h2>Recommended Jobs</h2>

        {!workerProfile && (
          <EmptyState
            icon={Briefcase}
            title="Create your profile to see recommendations"
            description="We match you with jobs once your worker profile exists."
            action={<Link to="/profile">Create profile</Link>}
          />
        )}

        {workerProfile && loadingRecommended && <Spinner label="Finding jobs for you..." />}
        {workerProfile && recommendedError && <ErrorBanner error={recommendedError} />}
        {applyError && <ErrorBanner error={applyError} />}

        {workerProfile && !loadingRecommended && !recommendedError && (!recommended || recommended.length === 0) && (
          <EmptyState icon={Briefcase} title="No recommended jobs found yet" description="Check back soon." />
        )}

        {workerProfile && recommended?.length > 0 && (
          <div className="worker-dashboard-job-list">
            {recommended.map((match) => (
              <JobCard
                key={match.job._id}
                job={match.job}
                matchScore={match.matchScore}
                matchFactors={match.matchFactors}
                explanation={match.explanation}
                onApply={() => handleApply(match.job._id)}
                applyDisabled={appliedJobIds.has(match.job._id) || match.job.status !== "open"}
                applyLabel={appliedJobIds.has(match.job._id) ? "Applied" : "Apply"}
              />
            ))}
          </div>
        )}
      </section>

      <section className="worker-dashboard-section">
        <h2>Recent Applications</h2>

        {loadingApplications && <Spinner label="Loading applications..." />}

        {!loadingApplications && recentApplications.length === 0 && (
          <EmptyState icon={FileText} title="No applications yet" description="Jobs you apply for will show up here." />
        )}

        {!loadingApplications && recentApplications.length > 0 && (
          <div className="worker-dashboard-applications">
            {recentApplications.map((application) => (
              <Card key={application._id} className="worker-dashboard-application-card">
                <div>
                  <h3>{application.jobId?.titleText || application.jobId?.title?.en || "Job"}</h3>
                  <p>₹{application.jobId?.payAmount} / {application.jobId?.payType}</p>
                </div>
                <StatusPill status={application.status} />
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

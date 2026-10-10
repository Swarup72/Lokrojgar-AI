import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Mic, Search, User, FileText, Briefcase, Sparkles, Inbox, ArrowRight } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAsync } from "../hooks/useAsync";
import { useLanguage } from "../hooks/useLanguage";
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
  const { t } = useLanguage();
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
    <div className="container worker-dashboard page-animate">
      <div className="worker-dashboard-header">
        <h1>{t("dashboard.greeting", { name: workerProfile?.fullName || user?.phone })}</h1>
        <p className="worker-dashboard-sub">{t("dashboard.workerSubtitle")}</p>
      </div>

      {workerProfile && (
        <Card className="worker-dashboard-completion-card">
          <div className="completion-info">
            <div className="completion-text">
              <Sparkles size={18} className="completion-sparkle" />
              <span>{t("dashboard.profileCompletion")}</span>
            </div>
            <strong>{completion}%</strong>
          </div>
          <div className="worker-dashboard-completion-bar">
            <div style={{ width: `${completion}%` }} />
          </div>
        </Card>
      )}

      <div className="worker-dashboard-actions">
        <Link to="/voice-profile" className="btn btn-primary visual-action-btn animated-button">
          <Mic size={18} aria-hidden="true" />
          <span>{t("createProfileVoice")}</span>
        </Link>
        <Link to="/jobs" className="btn btn-secondary visual-action-btn">
          <Search size={18} aria-hidden="true" />
          <span>{t("findJobs")}</span>
        </Link>
        <Link to="/profile" className="btn btn-secondary visual-action-btn">
          <User size={18} aria-hidden="true" />
          <span>{t("profile")}</span>
        </Link>
        <Link to="/applications" className="btn btn-secondary visual-action-btn">
          <FileText size={18} aria-hidden="true" />
          <span>{t("worker.dashboard.myApplicationsAction")}</span>
        </Link>
        <Link to="/job-requests" className="btn btn-secondary visual-action-btn">
          <Inbox size={18} aria-hidden="true" />
          <span>{t("nav.jobRequests")}</span>
        </Link>
      </div>

      <section className="worker-dashboard-section">
        <div className="section-title-row">
          <h2>{t("worker.dashboard.recommendedTitle")}</h2>
          <Link to="/jobs" className="section-view-all">
            <span>{t("viewAllJobs")}</span>
            <ArrowRight size={16} />
          </Link>
        </div>

        {!workerProfile && (
          <EmptyState
            icon={Briefcase}
            title={t("createProfilePrompt")}
            description={t("createProfilePromptDesc")}
            action={<Link to="/profile">{t("createProfile")}</Link>}
          />
        )}

        {workerProfile && loadingRecommended && <Spinner label={t("findingJobs")} />}
        {workerProfile && recommendedError && <ErrorBanner error={recommendedError} />}
        {applyError && <ErrorBanner error={applyError} />}

        {workerProfile && !loadingRecommended && !recommendedError && (!recommended || recommended.length === 0) && (
          <EmptyState
            icon={Briefcase}
            title={t("noRecommendedJobs")}
            description={t("checkBackSoon")}
          />
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
                applyLabel={appliedJobIds.has(match.job._id) ? t("common.applied") : t("common.apply")}
              />
            ))}
          </div>
        )}
      </section>

      <section className="worker-dashboard-section">
        <div className="section-title-row">
          <h2>{t("worker.dashboard.recentApplicationsTitle")}</h2>
          <Link to="/applications" className="section-view-all">
            <span>{t("common.viewAll")}</span>
            <ArrowRight size={16} />
          </Link>
        </div>

        {loadingApplications && <Spinner label={t("loadingApplications")} />}

        {!loadingApplications && recentApplications.length === 0 && (
          <EmptyState
            icon={FileText}
            title={t("noApplicationsYet")}
            description={t("noApplicationsDesc")}
          />
        )}

        {!loadingApplications && recentApplications.length > 0 && (
          <div className="worker-dashboard-applications">
            {recentApplications.map((application) => (
              <Card key={application._id} className="worker-dashboard-application-card animated-card">
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

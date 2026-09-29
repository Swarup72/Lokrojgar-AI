import { FileText } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { useLanguage } from "../hooks/useLanguage";
import * as applicationsApi from "../api/applications";
import { pickLocalizedText } from "../utils/localizedText";
import { Card } from "../components/common/Card";
import { StatusPill } from "../components/common/StatusPill";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import "./ApplicationsPage.css";

export function ApplicationsPage() {
  const { language } = useLanguage();
  const { data: applications, loading, error, run: refetch } = useAsync(applicationsApi.getMine);

  const handleWithdraw = async (applicationId) => {
    await applicationsApi.withdraw(applicationId);
    refetch();
  };

  return (
    <div className="container applications-page">
      <h1>My Applications</h1>

      {loading && <Spinner label="Loading your applications..." />}
      {!loading && error && <ErrorBanner error={error} onRetry={refetch} />}

      {!loading && !error && applications?.length === 0 && (
        <EmptyState icon={FileText} title="No applications yet" description="Jobs you apply for will show up here." />
      )}

      {!loading && !error && applications?.length > 0 && (
        <div className="applications-list">
          {applications.map((application) => {
            const job = application.jobId;
            const title = job?.titleText || pickLocalizedText(job?.title, language, job?.originalLanguage);
            const canWithdraw = ["applied", "shortlisted"].includes(application.status);
            return (
              <Card key={application._id} className="application-card">
                <div className="application-card-main">
                  <h3>{title || "Job"}</h3>
                  <p>
                    ₹{job?.payAmount} / {job?.payType}
                    {job?.city ? ` · ${job.city}` : ""}
                  </p>
                  <p className="application-card-date">
                    Applied {new Date(application.appliedAt || application.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="application-card-side">
                  <StatusPill status={application.status} />
                  {canWithdraw && (
                    <button type="button" className="application-withdraw-btn" onClick={() => handleWithdraw(application._id)}>
                      Withdraw
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

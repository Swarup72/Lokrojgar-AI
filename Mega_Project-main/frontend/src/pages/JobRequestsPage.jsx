import { useState } from "react";
import { Inbox, Check, X, Wallet, MapPin, Calendar, Briefcase } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { SHIFT_TYPE_KEYS } from "../utils/enumLabels";
import { useLanguage } from "../hooks/useLanguage";
import * as applicationsApi from "../api/applications";
import { normalizeError } from "../api/client";
import { pickLocalizedText } from "../utils/localizedText";
import { employerName } from "../utils/displayName";
import { Card } from "../components/common/Card";
import { StatusPill } from "../components/common/StatusPill";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import { MapLink } from "../components/common/MapLink";
import "./JobRequestsPage.css";

export function JobRequestsPage() {
  const { language, t } = useLanguage();
  const [respondingId, setRespondingId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const { data: requests, loading, error, run: refetch } = useAsync(applicationsApi.getInvitations);

  const respond = async (application, response) => {
    setRespondingId(application._id);
    setActionError(null);
    try {
      await applicationsApi.respondToInvitation(application._id, response);
      refetch();
    } catch (err) {
      setActionError(normalizeError(err));
      refetch();
    } finally {
      setRespondingId(null);
    }
  };

  const pending = requests?.filter((request) => request.status === "invited") || [];
  const answered = requests?.filter((request) => request.status !== "invited") || [];

  const renderRequest = (request, { actionable }) => {
    const job = request.jobId;
    const title = job?.titleText || pickLocalizedText(job?.title, language, job?.originalLanguage);
    const description = pickLocalizedText(job?.description, language, job?.originalLanguage);
    const postedBy = employerName(job?.employerId);
    const isResponding = respondingId === request._id;

    return (
      <Card key={request._id} className="job-request-card animated-card">
        <div className="job-request-head">
          <div>
            <h3>{title || "Job"}</h3>
            {postedBy && <p className="job-request-employer">{postedBy}</p>}
          </div>
          <StatusPill status={request.status} />
        </div>

        <div className="job-request-meta">
          <span>
            <Wallet size={15} aria-hidden="true" /> ₹{request.proposedPay || job?.payAmount} / {job?.payType}
            {request.proposedPay && request.proposedPay !== job?.payAmount ? ` (${t("offered")})` : ""}
          </span>
          {job?.city && (
            <span>
              <MapPin size={15} aria-hidden="true" /> {job.city}
            </span>
          )}
          {job?.startDate && (
            <span>
              <Calendar size={15} aria-hidden="true" /> {t("starts")} {new Date(job.startDate).toLocaleDateString()}
            </span>
          )}
          {job?.shiftType && (
            <span>
              <Briefcase size={15} aria-hidden="true" /> {t(SHIFT_TYPE_KEYS[job.shiftType] ?? job.shiftType)}
            </span>
          )}
        </div>

        {Array.isArray(job?.skillIds) && job.skillIds.length > 0 && (
          <div className="job-request-skills">
            {job.skillIds.map((skill) => (
              <span key={skill._id || skill} className="tag">
                {typeof skill === "object" ? pickLocalizedText(skill.name, language) : "Skill"}
              </span>
            ))}
          </div>
        )}

        {description && <p className="job-request-description">{description}</p>}

        <MapLink location={job?.location} label={job?.address || job?.city} kind={t("jobLocation")} />

        {actionable ? (
          <div className="job-request-actions">
            <button
              type="button"
              className="btn btn-success"
              onClick={() => respond(request, "accepted")}
              disabled={isResponding}
            >
              <Check size={15} aria-hidden="true" /> <span>{isResponding ? t("common.loading") : t("accept")}</span>
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => respond(request, "declined")}
              disabled={isResponding}
            >
              <X size={15} aria-hidden="true" /> <span>{t("jobRequests.reject")}</span>
            </button>
          </div>
        ) : (
          <p className="job-request-answered">
            {request.status === "accepted" && (t("acceptedRequestNote"))}
            {request.status === "declined" && (t("declinedRequestNote"))}
            {request.status === "completed" && (t("completedRequestNote"))}
            {!["accepted", "declined", "completed"].includes(request.status) &&
              `This request is ${request.status}.`}
          </p>
        )}
      </Card>
    );
  };

  return (
    <div className="container job-requests-page page-animate">
      <div className="job-requests-header">
        <h1>
          <Inbox size={24} aria-hidden="true" /> <span>{t("nav.jobRequests")}</span>
        </h1>
        <p className="job-requests-intro">{t("jobRequestsIntro")}</p>
      </div>

      {actionError && <ErrorBanner error={actionError} />}
      {loading && <Spinner label={t("loadingJobRequests")} />}
      {!loading && error && <ErrorBanner error={error} onRetry={refetch} />}

      {!loading && !error && requests?.length === 0 && (
        <EmptyState
          icon={Inbox}
          title={t("noJobRequestsYet")}
          description={t("noJobRequestsDesc")}
        />
      )}

      {pending.length > 0 && (
        <section className="job-requests-section">
          <h2>{t("waitingForAnswer")} ({pending.length})</h2>
          {pending.map((request) => renderRequest(request, { actionable: true }))}
        </section>
      )}

      {answered.length > 0 && (
        <section className="job-requests-section">
          <h2>{t("alreadyAnswered")}</h2>
          {answered.map((request) => renderRequest(request, { actionable: false }))}
        </section>
      )}
    </div>
  );
}

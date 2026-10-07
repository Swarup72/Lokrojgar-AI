import { useState } from "react";
import { Inbox, Check, X, Wallet, MapPin, Calendar, Briefcase } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
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

/**
 * A worker's incoming job requests - employers who picked them for a job.
 *
 * These are Applications with `initiatedBy: "employer"`, the same documents as
 * the worker's own applications, which is why accepting one goes straight into
 * the existing hiring flow rather than a parallel one. They get their own page
 * because the action required is the opposite: here the WORKER decides.
 */
export function JobRequestsPage() {
  const { language } = useLanguage();
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
      // A 400 here is usually "the job filled up while you were deciding" -
      // the server's message says which, and it must not be swallowed.
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
      <Card key={request._id} className="job-request-card">
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
            {request.proposedPay && request.proposedPay !== job?.payAmount ? " (offered)" : ""}
          </span>
          {job?.city && (
            <span>
              <MapPin size={15} aria-hidden="true" /> {job.city}
            </span>
          )}
          {job?.startDate && (
            <span>
              <Calendar size={15} aria-hidden="true" /> Starts {new Date(job.startDate).toLocaleDateString()}
            </span>
          )}
          {job?.shiftType && (
            <span>
              <Briefcase size={15} aria-hidden="true" /> {job.shiftType} shift
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

        {/* The job's OWN location - not the employer's. Contact details stay
            hidden until the request is accepted. */}
        <MapLink location={job?.location} label={job?.address || job?.city} kind="Job location" />

        {actionable ? (
          <div className="job-request-actions">
            <button
              type="button"
              className="btn btn-success"
              onClick={() => respond(request, "accepted")}
              disabled={isResponding}
            >
              <Check size={15} aria-hidden="true" /> {isResponding ? "Working..." : "Accept"}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => respond(request, "declined")}
              disabled={isResponding}
            >
              <X size={15} aria-hidden="true" /> Decline
            </button>
          </div>
        ) : (
          <p className="job-request-answered">
            {request.status === "accepted" && "You accepted this request. It now appears in My Applications."}
            {request.status === "declined" && "You declined this request."}
            {request.status === "completed" && "This work is finished."}
            {!["accepted", "declined", "completed"].includes(request.status) &&
              `This request is ${request.status}.`}
          </p>
        )}
      </Card>
    );
  };

  return (
    <div className="container job-requests-page">
      <h1>
        <Inbox size={22} aria-hidden="true" /> Job requests
      </h1>
      <p className="job-requests-intro">Employers who have asked you directly to take a job.</p>

      {actionError && <ErrorBanner error={actionError} />}
      {loading && <Spinner label="Loading your job requests..." />}
      {!loading && error && <ErrorBanner error={error} onRetry={refetch} />}

      {!loading && !error && requests?.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="No job requests yet"
          description="When an employer picks you for a job, their request will appear here. Keeping your skills and availability up to date makes you easier to find."
        />
      )}

      {pending.length > 0 && (
        <section className="job-requests-section">
          <h2>Waiting for your answer ({pending.length})</h2>
          {pending.map((request) => renderRequest(request, { actionable: true }))}
        </section>
      )}

      {answered.length > 0 && (
        <section className="job-requests-section">
          <h2>Already answered</h2>
          {answered.map((request) => renderRequest(request, { actionable: false }))}
        </section>
      )}
    </div>
  );
}

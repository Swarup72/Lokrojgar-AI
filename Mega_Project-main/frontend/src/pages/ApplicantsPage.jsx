import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, CheckCircle, XCircle, Star, Lock, MessageSquare } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { useLanguage } from "../hooks/useLanguage";
import * as applicationsApi from "../api/applications";
import * as jobsApi from "../api/jobs";
import * as ratingsApi from "../api/ratings";
import * as chatApi from "../api/chat";
import { normalizeError } from "../api/client";
import { pickLocalizedText } from "../utils/localizedText";
import { WorkerCard } from "../components/workers/WorkerCard";
import { StatusPill } from "../components/common/StatusPill";
import { RatingForm } from "../components/reviews/RatingForm";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import "./ApplicantsPage.css";

export function ApplicantsPage() {
  const { jobId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { language, t } = useLanguage();

  const [job, setJob] = useState(location.state?.job || null);
  const [ratedApplicationIds, setRatedApplicationIds] = useState(new Set());
  const [ratingApplicationId, setRatingApplicationId] = useState(null);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [closingJob, setClosingJob] = useState(false);
  const [chatBusyId, setChatBusyId] = useState(null);

  useEffect(() => {
    if (!job) {
      jobsApi
        .getEmployerMine()
        .then((jobs) => setJob(jobs.find((item) => item._id === jobId) || null))
        .catch(() => {});
    }
  }, [job, jobId]);

  const { data: applications, loading, error, run: refetch } = useAsync(() => applicationsApi.getForJob(jobId), {
    deps: [jobId],
  });

  const title = job ? pickLocalizedText(job.title, language, job.originalLanguage) : null;

  const runAction = async (action) => {
    setActionError(null);
    try {
      await action();
      refetch();
    } catch (err) {
      setActionError(normalizeError(err));
    }
  };

  const handleCloseJob = async () => {
    setClosingJob(true);
    try {
      const updated = await jobsApi.close(job._id);
      setJob(updated);
    } catch (err) {
      setActionError(normalizeError(err));
    } finally {
      setClosingJob(false);
    }
  };

  const openChat = async (application) => {
    setChatBusyId(application._id);
    setActionError(null);
    try {
      const conversation = await chatApi.getOrCreateConversation({
        jobId: job._id,
        workerId: application.workerId._id,
      });
      navigate("/messages", { state: { conversationId: conversation._id } });
    } catch (err) {
      setActionError(normalizeError(err));
    } finally {
      setChatBusyId(null);
    }
  };

  const chatButton = (application) => (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => openChat(application)}
      disabled={chatBusyId === application._id}
    >
      <MessageSquare size={15} aria-hidden="true" />{" "}
      {chatBusyId === application._id ? t("common.loading") : t("message")}
    </button>
  );

  const handleRate = async (application, payload) => {
    setSubmittingRating(true);
    try {
      await ratingsApi.submit({ jobId: job._id, toUserId: application.workerId.userId._id, ...payload });
      setRatedApplicationIds((prev) => new Set(prev).add(application._id));
      setRatingApplicationId(null);
      refetch();
    } catch (err) {
      const normalized = normalizeError(err);
      if (normalized.status === 409) {
        setRatedApplicationIds((prev) => new Set(prev).add(application._id));
        setRatingApplicationId(null);
      } else {
        setActionError(normalized);
      }
    } finally {
      setSubmittingRating(false);
    }
  };

  const renderActions = (application) => {
    const alreadyRated = ratedApplicationIds.has(application._id);

    if (application.status === "applied") {
      return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" onClick={() => runAction(() => applicationsApi.shortlist(application._id))}>
            {t("applicants.actionShortlist")}
          </button>
          <button type="button" className="btn btn-success" onClick={() => runAction(() => applicationsApi.setStatus(application._id, "accepted"))}>
            <CheckCircle size={15} aria-hidden="true" /> {t("accept")}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => runAction(() => applicationsApi.setStatus(application._id, "rejected"))}>
            <XCircle size={15} aria-hidden="true" /> {t("applicants.actionReject")}
          </button>
        </div>
      );
    }

    if (application.status === "shortlisted") {
      return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-success" onClick={() => runAction(() => applicationsApi.setStatus(application._id, "accepted"))}>
            <CheckCircle size={15} aria-hidden="true" /> {t("accept")}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => runAction(() => applicationsApi.setStatus(application._id, "rejected"))}>
            <XCircle size={15} aria-hidden="true" /> {t("applicants.actionReject")}
          </button>
        </div>
      );
    }

    if (application.status === "accepted") {
      return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {chatButton(application)}
          <button type="button" className="btn btn-secondary" onClick={() => runAction(() => applicationsApi.complete(application._id))}>
            {t("markComplete")}
          </button>
        </div>
      );
    }

    if (application.status === "invited") {
      return <span className="applicants-rate-hint">{t("requestSentWaiting")}</span>;
    }

    if (application.status === "declined") {
      return <span className="applicants-rate-hint">{t("workerDeclined")}</span>;
    }

    if (application.status === "completed") {
      if (alreadyRated) {
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {chatButton(application)}
            <span className="applicants-rated-note">{t("youRatedWorker")}</span>
          </div>
        );
      }
      if (job?.status !== "completed") {
        return (
          <span className="applicants-rate-hint">
            <Lock size={13} aria-hidden="true" /> {t("closeJobToRate")}
          </span>
        );
      }
      if (ratingApplicationId === application._id) {
        return <RatingForm onSubmit={(payload) => handleRate(application, payload)} submitting={submittingRating} />;
      }
      return (
        <button type="button" className="btn btn-secondary" onClick={() => setRatingApplicationId(application._id)}>
          <Star size={15} aria-hidden="true" /> {t("rateWorker")}
        </button>
      );
    }

    return null;
  };

  return (
    <div className="container applicants-page page-animate">
      <button type="button" className="applicants-back" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden="true" /> <span>{t("common.back")}</span>
      </button>

      <div className="applicants-header">
        <div>
          <h1>
            <Users size={24} aria-hidden="true" /> <span>{t("applicants")}</span>
          </h1>
          {title && <p className="applicants-subtitle">{t("forJob")} {title}</p>}
        </div>
        {job && (
          <div className="applicants-header-side">
            <StatusPill status={job.status} />
            {job.status !== "completed" && job.status !== "cancelled" && (
              <button type="button" className="btn btn-secondary" onClick={handleCloseJob} disabled={closingJob}>
                {closingJob ? t("common.loading") : t("employer.dashboard.actions.close")}
              </button>
            )}
          </div>
        )}
      </div>

      {actionError && <ErrorBanner error={actionError} />}
      {loading && <Spinner label={t("loadingApplicants")} />}
      {!loading && error && <ErrorBanner error={error} onRetry={refetch} />}

      {!loading && !error && applications?.length === 0 && (
        <EmptyState
          icon={Users}
          title={t("noApplicantsYet")}
          description={t("noApplicantsDesc")}
        />
      )}

      {!loading && !error && applications?.length > 0 && (
        <div className="applicants-list">
          {applications.map((application) => (
            <WorkerCard
              key={application._id}
              worker={application.workerId}
              jobId={jobId}
              matchScore={application.matchScore}
              matchFactors={application.matchFactors}
              actions={
                <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <StatusPill status={application.status} />
                  </div>
                  {renderActions(application)}
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Send, Check } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { useLanguage } from "../hooks/useLanguage";
import * as recommendationsApi from "../api/recommendations";
import * as jobsApi from "../api/jobs";
import * as applicationsApi from "../api/applications";
import { normalizeError } from "../api/client";
import { pickLocalizedText } from "../utils/localizedText";
import { WorkerCard } from "../components/workers/WorkerCard";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import "./RecommendedWorkersPage.css";

export function RecommendedWorkersPage() {
  const { jobId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { language, t } = useLanguage();

  const [job, setJob] = useState(location.state?.job || null);
  const [requestedWorkerIds, setRequestedWorkerIds] = useState(new Set());
  const [sendingWorkerId, setSendingWorkerId] = useState(null);
  const [requestError, setRequestError] = useState(null);

  useEffect(() => {
    if (!job) {
      jobsApi
        .getEmployerMine()
        .then((jobs) => setJob(jobs.find((item) => item._id === jobId) || null))
        .catch(() => {});
    }
  }, [job, jobId]);

  const { data: matches, loading, error } = useAsync(() => recommendationsApi.getRecommendedWorkers(jobId), {
    deps: [jobId],
  });

  const title = job ? pickLocalizedText(job.title, language, job.originalLanguage) : null;

  const sendRequest = async (worker) => {
    setSendingWorkerId(worker._id);
    setRequestError(null);
    try {
      await applicationsApi.invite({ jobId, workerId: worker._id });
      setRequestedWorkerIds((previous) => new Set(previous).add(worker._id));
    } catch (err) {
      const normalized = normalizeError(err);
      if (normalized.status === 409) {
        setRequestedWorkerIds((previous) => new Set(previous).add(worker._id));
      } else {
        setRequestError(normalized);
      }
    } finally {
      setSendingWorkerId(null);
    }
  };

  return (
    <div className="container recommended-workers-page page-animate">
      <button type="button" className="recommended-workers-back" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden="true" /> <span>{t("common.back")}</span>
      </button>

      <div className="recommended-workers-header">
        <h1>
          <Sparkles size={24} aria-hidden="true" /> <span>{t("recommendedWorkers.title")}</span>
        </h1>
        {title && <p className="recommended-workers-subtitle">{t("forJob")} {title}</p>}
      </div>

      {requestError && <ErrorBanner error={requestError} />}
      {loading && <Spinner label={t("findingMatchingWorkers")} />}
      {!loading && error && <ErrorBanner error={error} />}

      {!loading && !error && matches?.length === 0 && (
        <EmptyState
          title={t("noMatchingWorkers")}
          description={t("noMatchingWorkersDesc")}
        />
      )}

      {!loading && !error && matches?.length > 0 && (
        <div className="recommended-workers-list">
          {matches.map((match) => (
            <WorkerCard
              key={match.worker._id}
              worker={match.worker}
              matchScore={match.matchScore}
              matchFactors={match.matchFactors}
              explanation={match.explanation}
              actions={
                requestedWorkerIds.has(match.worker._id) ? (
                  <span className="recommended-workers-sent">
                    <Check size={14} aria-hidden="true" /> {t("requestSentWaiting")}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary animated-button"
                    onClick={() => sendRequest(match.worker)}
                    disabled={sendingWorkerId === match.worker._id}
                  >
                    <Send size={15} aria-hidden="true" />{" "}
                    <span>{sendingWorkerId === match.worker._id ? t("sending") : t("sendJobRequest")}</span>
                  </button>
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

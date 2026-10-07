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
  const { language } = useLanguage();

  const [job, setJob] = useState(location.state?.job || null);
  const [requestedWorkerIds, setRequestedWorkerIds] = useState(new Set());
  const [sendingWorkerId, setSendingWorkerId] = useState(null);
  const [requestError, setRequestError] = useState(null);

  // On a cold load (no router state, e.g. a page refresh) the employer's
  // own job list is the one place this job's data can be recovered from -
  // there is no GET /jobs/:jobId endpoint to fetch it directly.
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

  /**
   * Sends this worker a job request. The request becomes an Application with
   * status "invited" - the same document the worker would have created by
   * applying - so accepting it goes through the one hiring path and cannot
   * over-hire the job.
   */
  const sendRequest = async (worker) => {
    setSendingWorkerId(worker._id);
    setRequestError(null);
    try {
      await applicationsApi.invite({ jobId, workerId: worker._id });
      setRequestedWorkerIds((previous) => new Set(previous).add(worker._id));
    } catch (err) {
      const normalized = normalizeError(err);
      // 409 means this worker already has a request or application for the job -
      // the same end state the button was trying to reach, so it is shown as
      // done rather than as a failure.
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
    <div className="container recommended-workers-page">
      <button type="button" className="recommended-workers-back" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden="true" /> Back
      </button>

      <h1>
        <Sparkles size={22} aria-hidden="true" /> Recommended Workers
      </h1>
      {title && <p className="recommended-workers-subtitle">For: {title}</p>}

      {requestError && <ErrorBanner error={requestError} />}
      {loading && <Spinner label="Finding matching workers..." />}
      {!loading && error && <ErrorBanner error={error} />}

      {!loading && !error && matches?.length === 0 && (
        <EmptyState title="No matching workers found yet" description="Check back once more workers have joined." />
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
                    <Check size={14} aria-hidden="true" /> Request sent — waiting for their answer
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => sendRequest(match.worker)}
                    disabled={sendingWorkerId === match.worker._id}
                  >
                    <Send size={15} aria-hidden="true" />{" "}
                    {sendingWorkerId === match.worker._id ? "Sending..." : "Send job request"}
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

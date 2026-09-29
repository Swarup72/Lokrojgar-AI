import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { useLanguage } from "../hooks/useLanguage";
import * as recommendationsApi from "../api/recommendations";
import * as jobsApi from "../api/jobs";
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

  return (
    <div className="container recommended-workers-page">
      <button type="button" className="recommended-workers-back" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden="true" /> Back
      </button>

      <h1>
        <Sparkles size={22} aria-hidden="true" /> Recommended Workers
      </h1>
      {title && <p className="recommended-workers-subtitle">For: {title}</p>}

      {loading && <Spinner label="Finding matching workers..." />}
      {!loading && error && <ErrorBanner error={error} />}

      {!loading && !error && matches?.length === 0 && (
        <EmptyState title="No matching workers found yet" description="Check back once more workers have joined." />
      )}

      {!loading && !error && matches?.length > 0 && (
        <div className="recommended-workers-list">
          {matches.map((match) => (
            <WorkerCard key={match.worker._id} worker={match.worker} matchScore={match.matchScore} matchFactors={match.matchFactors} />
          ))}
        </div>
      )}
    </div>
  );
}

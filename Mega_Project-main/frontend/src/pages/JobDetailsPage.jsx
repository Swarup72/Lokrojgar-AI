import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import {
  MapPin,
  Wallet,
  Briefcase,
  Clock,
  Languages,
  CalendarDays,
  ArrowLeft,
  Users,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { PAY_TYPE_KEYS, SHIFT_TYPE_KEYS } from "../utils/enumLabels";
import { useLanguage } from "../hooks/useLanguage";
import { employerName } from "../utils/displayName";
import { pickLocalizedText } from "../utils/localizedText";
import { USER_ROLES } from "../utils/enums";
import * as jobsApi from "../api/jobs";
import * as applicationsApi from "../api/applications";
import { normalizeError } from "../api/client";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { StatusPill } from "../components/common/StatusPill";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import { JobStatusActions } from "../components/jobs/JobStatusActions";
import "./JobDetailsPage.css";

export function JobDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, employerProfile } = useAuth();
  const { language, t } = useLanguage();

  const [job, setJob] = useState(location.state?.job || null);
  const [loading, setLoading] = useState(!location.state?.job);
  const [fetchError, setFetchError] = useState(null);

  const [coverNote, setCoverNote] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [applied, setApplied] = useState(false);

  const fetchJob = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setFetchError(null);
    jobsApi
      .getById(id)
      .then((data) => {
        setJob(data);
      })
      .catch((err) => {
        setFetchError(normalizeError(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!job && id) {
      fetchJob();
    }
  }, [id, job, fetchJob]);

  if (loading) {
    return (
      <div className="container" style={{ padding: "60px 0" }}>
        <Spinner label={t("common.loading")} />
      </div>
    );
  }

  if (fetchError && !job) {
    return (
      <div className="container" style={{ padding: "40px 0", maxWidth: 720 }}>
        <ErrorBanner error={fetchError} onRetry={fetchJob} />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate(-1)}
          style={{ marginTop: 16 }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> {t("common.back")}
        </button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container" style={{ padding: "60px 0" }}>
        <EmptyState
          icon={Briefcase}
          title={t("jobs.notFound")}
          description={t("jobs.notFoundDesc")}
          action={<Link to="/jobs">{t("browseAllJobs")}</Link>}
        />
      </div>
    );
  }

  const title = job.titleText || pickLocalizedText(job.title, language, job.originalLanguage);
  const description =
    job.descriptionText || pickLocalizedText(job.description, language, job.originalLanguage);
  const postedBy = employerName(job.employerId);
  const isWorker = user?.roles?.includes(USER_ROLES.WORKER);
  const isOwner =
    job.isOwner ||
    (employerProfile &&
      String(employerProfile._id) === String(job.employerId?._id || job.employerId));
  const isOpen = job.status === "open";

  const handleApply = async (event) => {
    event.preventDefault();
    setApplying(true);
    setApplyError(null);
    try {
      await applicationsApi.apply({ jobId: job._id, coverNote: coverNote || undefined });
      setApplied(true);
    } catch (err) {
      setApplyError(normalizeError(err));
    } finally {
      setApplying(false);
    }
  };

  const handleEmployerAction = (action) => {
    if (action === "delete") {
      navigate("/employer-dashboard", { state: { message: t("jobs.deletedSuccess") } });
    } else {
      fetchJob();
    }
  };

  return (
    <div className="container job-details-page page-animate">
      <button type="button" className="job-details-back" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden="true" /> <span>{t("common.back")}</span>
      </button>

      {location.state?.message && (
        <div
          style={{
            background: "var(--color-success-bg, #ecfdf5)",
            color: "var(--color-success-text, #065f46)",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            marginBottom: 20,
            fontSize: "var(--text-sm)",
            fontWeight: 500,
          }}
        >
          {location.state.message}
        </div>
      )}

      {isOwner && (
        <Card className="job-employer-bar" style={{ marginBottom: 20, padding: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {t("jobs.employerManagement")}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <StatusPill status={job.status} />
                <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-2)" }}>
                  <Users size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  {job.filledWorkers || 0} / {job.requiredWorkers || 1} {t("workersHired")}
                </span>
              </div>
            </div>
          </div>
          <JobStatusActions job={job} onActionCompleted={handleEmployerAction} />
        </Card>
      )}

      <Card className="job-details-card">
        <div className="job-details-header">
          <div className="job-details-icon">
            <Briefcase size={28} aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <h1>{title || t("jobs.untitled")}</h1>
              <StatusPill status={job.status} />
            </div>
            {postedBy && <p className="job-details-employer">{postedBy}</p>}
          </div>
        </div>

        <div className="job-details-grid">
          {job.city && (
            <div className="job-details-info">
              <MapPin size={17} aria-hidden="true" />
              <span>
                {job.city}
                {job.address ? ` (${job.address})` : ""}
              </span>
            </div>
          )}
          <div className="job-details-info">
            <Wallet size={17} aria-hidden="true" />
            <span>
              ₹{job.payAmount} / {t(PAY_TYPE_KEYS[job.payType] ?? job.payType)}
            </span>
          </div>
          <div className="job-details-info">
            <Users size={17} aria-hidden="true" />
            <span>
              {job.requiredWorkers} {t("workersNeeded")} ({job.filledWorkers || 0} {t("workersHired")})
            </span>
          </div>
          {typeof job.experienceRequired === "number" && (
            <div className="job-details-info">
              <Briefcase size={17} aria-hidden="true" />
              <span>
                {job.experienceRequired === 0
                  ? t("noExperienceRequired")
                  : `${job.experienceRequired}+ ${t("yearsExperience")}`}
              </span>
            </div>
          )}
          {job.shiftType && (
            <div className="job-details-info">
              <Clock size={17} aria-hidden="true" />
              <span>
                {t(SHIFT_TYPE_KEYS[job.shiftType] ?? job.shiftType)}
                {job.startTime && job.endTime ? ` (${job.startTime} - ${job.endTime})` : ""}
              </span>
            </div>
          )}
          {job.preferredLanguages?.length > 0 && (
            <div className="job-details-info">
              <Languages size={17} aria-hidden="true" />
              <span>{job.preferredLanguages.join(", ")}</span>
            </div>
          )}
          {job.startDate && (
            <div className="job-details-info">
              <CalendarDays size={17} aria-hidden="true" />
              <span>{t("starts")} {new Date(job.startDate).toLocaleDateString()}</span>
            </div>
          )}
          {job.applicationDeadline && (
            <div className="job-details-info">
              <CalendarDays size={17} aria-hidden="true" />
              <span>
                {t("deadline")} {new Date(job.applicationDeadline).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {description && (
          <div className="job-details-description">
            <h2>{t("description")}</h2>
            <p>{description}</p>
          </div>
        )}

        {Array.isArray(job.skillIds) &&
          job.skillIds.length > 0 &&
          typeof job.skillIds[0] === "object" && (
            <div className="job-details-skills">
              {job.skillIds.map((skill) => (
                <span className="job-details-skill-tag" key={skill._id}>
                  {pickLocalizedText(skill.nameMultilingual || skill.name, language) ||
                    (typeof skill.name === "string" ? skill.name : "")}
                </span>
              ))}
            </div>
          )}

        {!isOwner && (
          <div className="job-details-apply">
            {!isAuthenticated && (
              <p className="job-details-apply-hint">
                <Link to="/login">{t("login")}</Link> {t("jobs.loginToApply")}
              </p>
            )}

            {isAuthenticated && !isWorker && (
              <p className="job-details-apply-hint">{t("jobs.workerOnlyApply")}</p>
            )}

            {isAuthenticated && isWorker && !isOpen && (
              <p className="job-details-apply-hint">{t("jobs.noLongerAccepting")}</p>
            )}

            {isAuthenticated && isWorker && isOpen && !applied && (
              <form onSubmit={handleApply}>
                {applyError && <ErrorBanner error={applyError} />}
                <label className="job-details-cover-note">
                  <span>
                    {t("applications.coverNote")} <em>({t("common.optional")})</em>
                  </span>
                  <textarea
                    rows={3}
                    value={coverNote}
                    onChange={(event) => setCoverNote(event.target.value)}
                    placeholder={t("coverNotePlaceholder")}
                  />
                </label>
                <Button type="submit" size="lg" disabled={applying} className="animated-button">
                  {applying ? t("applying") : t("jobs.details.applyTitle")}
                </Button>
              </form>
            )}

            {applied && <p className="job-details-applied">{t("youApplied")}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { MapPin, Wallet, Briefcase, Clock, Languages, CalendarDays, ArrowLeft } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { pickLocalizedText } from "../utils/localizedText";
import { USER_ROLES } from "../utils/enums";
import * as applicationsApi from "../api/applications";
import { normalizeError } from "../api/client";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import "./JobDetailsPage.css";

export function JobDetailsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const job = location.state?.job;

  const [coverNote, setCoverNote] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [applied, setApplied] = useState(false);

  if (!job) {
    return (
      <div className="container" style={{ padding: "60px 0" }}>
        <EmptyState
          icon={Briefcase}
          title="Open this job from the jobs list"
          description="Job details aren't available on a direct link yet - please browse from the jobs list."
          action={<Link to="/jobs">Go to Find Jobs</Link>}
        />
      </div>
    );
  }

  const title = job.titleText || pickLocalizedText(job.title, language, job.originalLanguage);
  const description = job.descriptionText || pickLocalizedText(job.description, language, job.originalLanguage);
  const employerName = typeof job.employerId === "object" ? job.employerId?.businessName : null;
  const isWorker = user?.roles?.includes(USER_ROLES.WORKER);
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

  return (
    <div className="container job-details-page">
      <button type="button" className="job-details-back" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden="true" /> Back
      </button>

      <Card className="job-details-card">
        <div className="job-details-header">
          <div className="job-details-icon">
            <Briefcase size={28} aria-hidden="true" />
          </div>
          <div>
            <h1>{title || "Untitled job"}</h1>
            {employerName && <p className="job-details-employer">{employerName}</p>}
          </div>
        </div>

        <div className="job-details-grid">
          {job.city && (
            <div className="job-details-info">
              <MapPin size={17} aria-hidden="true" />
              <span>{job.city}</span>
            </div>
          )}
          <div className="job-details-info">
            <Wallet size={17} aria-hidden="true" />
            <span>
              ₹{job.payAmount} / {job.payType}
            </span>
          </div>
          {typeof job.experienceRequired === "number" && (
            <div className="job-details-info">
              <Briefcase size={17} aria-hidden="true" />
              <span>{job.experienceRequired}+ years experience</span>
            </div>
          )}
          {job.shiftType && (
            <div className="job-details-info">
              <Clock size={17} aria-hidden="true" />
              <span>{job.shiftType} shift</span>
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
              <span>Starts {new Date(job.startDate).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {description && (
          <div className="job-details-description">
            <h2>Description</h2>
            <p>{description}</p>
          </div>
        )}

        {Array.isArray(job.skillIds) && job.skillIds.length > 0 && typeof job.skillIds[0] === "object" && (
          <div className="job-details-skills">
            {job.skillIds.map((skill) => (
              <span className="job-details-skill-tag" key={skill._id}>
                {pickLocalizedText(skill.nameMultilingual || skill.name, language) ||
                  (typeof skill.name === "string" ? skill.name : "")}
              </span>
            ))}
          </div>
        )}

        <div className="job-details-apply">
          {!isAuthenticated && (
            <p className="job-details-apply-hint">
              <Link to="/login">Log in</Link> as a worker to apply for this job.
            </p>
          )}

          {isAuthenticated && !isWorker && (
            <p className="job-details-apply-hint">Only worker accounts can apply for jobs.</p>
          )}

          {isAuthenticated && isWorker && !isOpen && (
            <p className="job-details-apply-hint">This job is no longer accepting new applications.</p>
          )}

          {isAuthenticated && isWorker && isOpen && !applied && (
            <form onSubmit={handleApply}>
              {applyError && <ErrorBanner error={applyError} />}
              <label className="job-details-cover-note">
                <span>
                  Cover note <em>(optional)</em>
                </span>
                <textarea
                  rows={3}
                  value={coverNote}
                  onChange={(event) => setCoverNote(event.target.value)}
                  placeholder="Tell the employer why you're a good fit..."
                />
              </label>
              <Button type="submit" size="lg" disabled={applying}>
                {applying ? "Applying..." : "Apply for this job"}
              </Button>
            </form>
          )}

          {applied && <p className="job-details-applied">You've applied for this job.</p>}
        </div>
      </Card>
    </div>
  );
}

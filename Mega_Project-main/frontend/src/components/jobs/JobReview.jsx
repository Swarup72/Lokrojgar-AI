import { useState, useEffect } from "react";
import {
  Briefcase,
  MapPin,
  Wallet,
  Users,
  Calendar,
  Clock,
  Globe,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  FileEdit,
} from "lucide-react";
import * as catalogApi from "../../api/catalog";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { LANGUAGE_LABELS } from "../../utils/enums";
import { Card } from "../common/Card";
import { Button } from "../common/Button";
import "./JobReview.css";

export function JobReview({
  jobData,
  onBack,
  onPublish,
  onSaveDraft,
  publishing = false,
  savingDraft = false,
}) {
  const { language } = useLanguage();
  const [categoryName, setCategoryName] = useState("");
  const [skillNames, setSkillNames] = useState([]);

  useEffect(() => {
    if (jobData.categoryId) {
      catalogApi.getCategories().then((categories) => {
        const cat = categories.find((c) => c._id === jobData.categoryId);
        if (cat) {
          setCategoryName(pickLocalizedText(cat.nameMultilingual, language) || cat.name);
        }
      });
      catalogApi.getSkills(jobData.categoryId).then((skills) => {
        const selected = skills.filter((s) => (jobData.skillIds || []).includes(s._id));
        setSkillNames(selected.map((s) => pickLocalizedText(s.nameMultilingual, language) || s.name));
      });
    }
  }, [jobData.categoryId, jobData.skillIds, language]);

  return (
    <div className="job-review-container">
      <div className="job-review-header">
        <button type="button" onClick={onBack} className="job-review-back-btn">
          <ArrowLeft size={16} aria-hidden="true" /> Edit Details
        </button>
        <h2>Review Job Before Publishing</h2>
        <p className="job-review-subtitle">
          Please review the job details below. When published, LokRozgar AI will automatically
          translate the title and description into Marathi, Hindi, and English.
        </p>
      </div>

      <div className="job-review-ai-notice">
        <Sparkles size={18} aria-hidden="true" />
        <div>
          <strong>AI Multilingual Translation Active</strong>
          <p>
            Your post written in <em>{LANGUAGE_LABELS[jobData.originalLanguage] || jobData.originalLanguage}</em>{" "}
            will be translated so local workers speaking any language can find and apply for it.
          </p>
        </div>
      </div>

      <Card className="job-review-card">
        <div className="job-review-title-section">
          <h3>{jobData.title}</h3>
          {jobData.description && <p className="job-review-desc">{jobData.description}</p>}
        </div>

        <div className="job-review-grid">
          <div className="job-review-item">
            <Briefcase size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">Category</span>
              <span className="job-review-item-value">{categoryName || "Selected Category"}</span>
            </div>
          </div>

          <div className="job-review-item">
            <Wallet size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">Pay Offer</span>
              <span className="job-review-item-value">
                ₹{jobData.payAmount} / {jobData.payType}
              </span>
            </div>
          </div>

          <div className="job-review-item">
            <Users size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">Open Positions</span>
              <span className="job-review-item-value">{jobData.requiredWorkers} worker(s) needed</span>
            </div>
          </div>

          <div className="job-review-item">
            <Calendar size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">Start Date</span>
              <span className="job-review-item-value">
                {new Date(jobData.startDate).toLocaleDateString()}
              </span>
            </div>
          </div>

          {jobData.applicationDeadline && (
            <div className="job-review-item">
              <Calendar size={16} aria-hidden="true" />
              <div>
                <span className="job-review-item-label">Application Deadline</span>
                <span className="job-review-item-value">
                  {new Date(jobData.applicationDeadline).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}

          <div className="job-review-item">
            <Clock size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">Shift</span>
              <span className="job-review-item-value" style={{ textTransform: "capitalize" }}>
                {jobData.shiftType}
                {jobData.startTime && jobData.endTime
                  ? ` (${jobData.startTime} - ${jobData.endTime})`
                  : ""}
              </span>
            </div>
          </div>

          <div className="job-review-item">
            <MapPin size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">Location</span>
              <span className="job-review-item-value">
                {jobData.city ? `${jobData.city} · ` : ""}
                {jobData.address || "Location set on map"}
              </span>
            </div>
          </div>

          <div className="job-review-item">
            <Globe size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">Source Language</span>
              <span className="job-review-item-value">
                {LANGUAGE_LABELS[jobData.originalLanguage] || jobData.originalLanguage}
              </span>
            </div>
          </div>
        </div>

        {skillNames.length > 0 && (
          <div className="job-review-skills">
            <span className="job-review-item-label">Skills Required</span>
            <div className="job-review-skill-chips">
              {skillNames.map((skill, idx) => (
                <span key={idx} className="job-review-chip">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {jobData.experienceRequired > 0 && (
          <div style={{ marginTop: 12 }}>
            <span className="job-review-item-label">Experience Required:</span>{" "}
            <strong>{jobData.experienceRequired} year(s)</strong>
          </div>
        )}

        <div className="job-review-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            disabled={publishing || savingDraft}
          >
            <FileEdit size={16} aria-hidden="true" /> Back to Edit
          </Button>

          {onSaveDraft && (
            <Button
              type="button"
              variant="outline"
              onClick={onSaveDraft}
              disabled={publishing || savingDraft}
            >
              {savingDraft ? "Saving Draft..." : "Save as Draft"}
            </Button>
          )}

          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={onPublish}
            disabled={publishing || savingDraft}
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            {publishing ? "Publishing & Translating..." : "Publish Job Now"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

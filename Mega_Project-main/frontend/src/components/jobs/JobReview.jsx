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
import { PAY_TYPE_KEYS, SHIFT_TYPE_KEYS } from "../../utils/enumLabels";
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
  const { language, t } = useLanguage();
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
          <ArrowLeft size={16} aria-hidden="true" /> {t("jobs.review.editDetails")}
        </button>
        <h2>{t("jobs.review.title")}</h2>
        <p className="job-review-subtitle">{t("jobs.review.subtitle")}</p>
      </div>

      <div className="job-review-ai-notice">
        <Sparkles size={18} aria-hidden="true" />
        <div>
          <strong>{t("jobs.review.aiNoticeTitle")}</strong>
          <p>{t("jobs.review.aiNoticeBody", { language: LANGUAGE_LABELS[jobData.originalLanguage] || jobData.originalLanguage })}</p>
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
              <span className="job-review-item-label">{t("jobs.review.category")}</span>
              <span className="job-review-item-value">{categoryName || t("jobs.review.selectedCategory")}</span>
            </div>
          </div>

          <div className="job-review-item">
            <Wallet size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">{t("jobs.review.payOffer")}</span>
              <span className="job-review-item-value">
                ₹{jobData.payAmount} / {t(PAY_TYPE_KEYS[jobData.payType] ?? jobData.payType)}
              </span>
            </div>
          </div>

          <div className="job-review-item">
            <Users size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">{t("jobs.review.openPositions")}</span>
              <span className="job-review-item-value">{t("jobs.review.workersNeeded", { count: jobData.requiredWorkers })}</span>
            </div>
          </div>

          <div className="job-review-item">
            <Calendar size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">{t("jobs.review.startDate")}</span>
              <span className="job-review-item-value">
                {new Date(jobData.startDate).toLocaleDateString()}
              </span>
            </div>
          </div>

          {jobData.applicationDeadline && (
            <div className="job-review-item">
              <Calendar size={16} aria-hidden="true" />
              <div>
                <span className="job-review-item-label">{t("jobs.review.deadline")}</span>
                <span className="job-review-item-value">
                  {new Date(jobData.applicationDeadline).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}

          <div className="job-review-item">
            <Clock size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">{t("jobs.form.shiftLabel")}</span>
              <span className="job-review-item-value">
                {t(SHIFT_TYPE_KEYS[jobData.shiftType] ?? jobData.shiftType)}
                {jobData.startTime && jobData.endTime
                  ? ` (${jobData.startTime} - ${jobData.endTime})`
                  : ""}
              </span>
            </div>
          </div>

          <div className="job-review-item">
            <MapPin size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">{t("common.location")}</span>
              <span className="job-review-item-value">
                {jobData.city ? `${jobData.city} · ` : ""}
                {jobData.address || t("jobs.review.locationOnMap")}
              </span>
            </div>
          </div>

          <div className="job-review-item">
            <Globe size={16} aria-hidden="true" />
            <div>
              <span className="job-review-item-label">{t("jobs.review.sourceLanguage")}</span>
              <span className="job-review-item-value">
                {LANGUAGE_LABELS[jobData.originalLanguage] || jobData.originalLanguage}
              </span>
            </div>
          </div>
        </div>

        {skillNames.length > 0 && (
          <div className="job-review-skills">
            <span className="job-review-item-label">{t("jobs.review.skillsRequired")}</span>
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
            <span className="job-review-item-label">{t("jobs.review.experienceRequired")}</span>{" "}
            <strong>{t("jobs.review.years", { count: jobData.experienceRequired })}</strong>
          </div>
        )}

        <div className="job-review-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            disabled={publishing || savingDraft}
          >
            <FileEdit size={16} aria-hidden="true" /> {t("jobs.review.backToEdit")}
          </Button>

          {onSaveDraft && (
            <Button
              type="button"
              variant="outline"
              onClick={onSaveDraft}
              disabled={publishing || savingDraft}
            >
              {savingDraft ? t("jobs.review.savingDraft") : t("jobs.form.saveDraft")}
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
            {publishing ? t("jobs.review.publishing") : t("jobs.form.publish")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

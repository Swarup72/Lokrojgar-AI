import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as jobsApi from "../api/jobs";
import { normalizeError } from "../api/client";
import { Card } from "../components/common/Card";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { JobForm } from "../components/jobs/JobForm";
import { JobReview } from "../components/jobs/JobReview";
import { GuidedVoiceJobWizard } from "../components/jobs/GuidedVoiceJobWizard";
import { useLanguage } from "../hooks/useLanguage";
import { APP_LANGUAGES, LANGUAGE_LABELS } from "../utils/enums";
import { Mic, PencilLine } from "lucide-react";
import "./PostJobPage.css";

export function PostJobPage() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();

  // "choose" -> "voice" -> "form" -> "review", or "choose" -> "form" -> "review".
  // The manual path is unchanged: picking "manual" lands on exactly the form
  // that existed before, with no initial values.
  const [step, setStep] = useState("choose");
  const [spokenLanguage, setSpokenLanguage] = useState(language);
  const [formData, setFormData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState(null);

  const handleFormSubmit = (data) => {
    setFormData(data);
    setError(null);
    setStep("review");
  };

  const handlePublish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: { [formData.originalLanguage]: formData.title },
        description: formData.description
          ? { [formData.originalLanguage]: formData.description }
          : undefined,
        originalLanguage: formData.originalLanguage,
        categoryId: formData.categoryId,
        skillIds: formData.skillIds,
        city: formData.city,
        address: formData.address,
        coordinates: formData.coordinates,
        payType: formData.payType,
        payAmount: formData.payAmount,
        requiredWorkers: formData.requiredWorkers,
        startDate: formData.startDate,
        applicationDeadline: formData.applicationDeadline,
        experienceRequired: formData.experienceRequired,
        preferredLanguages: formData.preferredLanguages,
        shiftType: formData.shiftType,
        startTime: formData.startTime,
        endTime: formData.endTime,
        status: "open",
      };

      const job = await jobsApi.create(payload);
      navigate("/employer-dashboard", {
        state: { message: t("jobs.form.successPublish"), newJob: job },
      });
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setError(null);
    try {
      const payload = {
        title: { [formData.originalLanguage]: formData.title },
        description: formData.description
          ? { [formData.originalLanguage]: formData.description }
          : undefined,
        originalLanguage: formData.originalLanguage,
        categoryId: formData.categoryId,
        skillIds: formData.skillIds,
        city: formData.city,
        address: formData.address,
        coordinates: formData.coordinates,
        payType: formData.payType,
        payAmount: formData.payAmount,
        requiredWorkers: formData.requiredWorkers,
        startDate: formData.startDate,
        applicationDeadline: formData.applicationDeadline,
        experienceRequired: formData.experienceRequired,
        preferredLanguages: formData.preferredLanguages,
        shiftType: formData.shiftType,
        startTime: formData.startTime,
        endTime: formData.endTime,
        status: "draft",
      };

      const job = await jobsApi.create(payload);
      navigate("/employer-dashboard", {
        state: { message: t("jobs.form.successDraft"), newJob: job },
      });
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="container post-job-page">
      {error && <ErrorBanner error={error} />}

      {step === "choose" && (
        <>
          <h1>{t("home.hero.postJob")}</h1>
          <p className="post-job-subtitle" style={{ color: "var(--color-muted)", marginBottom: 20 }}>
            {t("voiceJob.chooseSubtitle")}
          </p>
          <div className="post-job-modes">
            <button type="button" className="post-job-mode" onClick={() => setStep("form")}>
              <PencilLine size={22} aria-hidden="true" />
              <strong>{t("voiceJob.modeManual")}</strong>
              <span>{t("voiceJob.modeManualDesc")}</span>
            </button>
            <button type="button" className="post-job-mode" onClick={() => setStep("voice")}>
              <Mic size={22} aria-hidden="true" />
              <strong>{t("voiceJob.modeVoice")}</strong>
              <span>{t("voiceJob.modeVoiceDesc")}</span>
            </button>
          </div>
        </>
      )}

      {step === "voice" && (
        <>
          <h1>{t("voiceJob.title")}</h1>
          <label className="form-field post-job-voice-language">
            <span>{t("voiceJob.spokenLanguage")}</span>
            <select value={spokenLanguage} onChange={(event) => setSpokenLanguage(event.target.value)}>
              {APP_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </select>
          </label>
          <Card>
            <GuidedVoiceJobWizard
              key={spokenLanguage}
              spokenLanguage={spokenLanguage}
              onComplete={(values) => {
                // The wizard hands over reviewed values; they populate the
                // existing form. Nothing has been published at this point.
                setFormData(values);
                setStep("form");
              }}
              onExit={() => setStep("choose")}
            />
          </Card>
        </>
      )}

      {step === "form" ? (
        <>
          <h1>{t("home.hero.postJob")}</h1>
          <p className="post-job-subtitle" style={{ color: "var(--color-muted)", marginBottom: 20 }}>
            {t("jobs.form.postSubtitle")}
          </p>
          <Card>
            <JobForm
              initialValues={formData || {}}
              onSubmit={handleFormSubmit}
              submitLabel={t("jobs.form.reviewDetails")}
            />
          </Card>
        </>
      ) : step === "review" ? (
        <JobReview
          jobData={formData}
          onBack={() => setStep("form")}
          onPublish={handlePublish}
          onSaveDraft={handleSaveDraft}
          publishing={submitting}
          savingDraft={savingDraft}
        />
      ) : null}
    </div>
  );
}

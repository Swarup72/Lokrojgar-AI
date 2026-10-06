import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as jobsApi from "../api/jobs";
import { normalizeError } from "../api/client";
import { Card } from "../components/common/Card";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { JobForm } from "../components/jobs/JobForm";
import { JobReview } from "../components/jobs/JobReview";
import "./PostJobPage.css";

export function PostJobPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState("form"); // "form" | "review"
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
        state: { message: "Job published successfully with auto-translations!", newJob: job },
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
        state: { message: "Job saved as draft.", newJob: job },
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

      {step === "form" ? (
        <>
          <h1>Post a Job</h1>
          <p className="post-job-subtitle" style={{ color: "var(--color-muted)", marginBottom: 20 }}>
            Fill in the details below. You will have a chance to review everything before publishing.
          </p>
          <Card>
            <JobForm
              initialValues={formData || {}}
              onSubmit={handleFormSubmit}
              submitLabel="Review Job Details"
            />
          </Card>
        </>
      ) : (
        <JobReview
          jobData={formData}
          onBack={() => setStep("form")}
          onPublish={handlePublish}
          onSaveDraft={handleSaveDraft}
          publishing={submitting}
          savingDraft={savingDraft}
        />
      )}
    </div>
  );
}

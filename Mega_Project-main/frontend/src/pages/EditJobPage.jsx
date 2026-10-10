import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Briefcase } from "lucide-react";
import * as jobsApi from "../api/jobs";
import { normalizeError } from "../api/client";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import { JobForm } from "../components/jobs/JobForm";
import { useLanguage } from "../hooks/useLanguage";

export function EditJobPage() {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    jobsApi
      .getById(id)
      .then((data) => {
        setJob(data);
      })
      .catch((err) => {
        setError(normalizeError(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  const handleUpdate = async (formData) => {
    setSaving(true);
    setError(null);
    try {
      const origLang = formData.originalLanguage || job.originalLanguage || "en";
      const payload = {
        title: { [origLang]: formData.title },
        description: formData.description ? { [origLang]: formData.description } : undefined,
        originalLanguage: origLang,
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
      };

      const updated = await jobsApi.update(id, payload);
      navigate(`/jobs/${id}`, {
        state: { job: updated, message: t("jobs.form.successUpdate") },
      });
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: "60px 0" }}>
        <Spinner label={t("jobs.form.loadingJob")} />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="container" style={{ padding: "40px 0", maxWidth: 720 }}>
        <ErrorBanner error={error} onRetry={() => window.location.reload()} />
        <Link to="/employer-dashboard" className="btn btn-secondary" style={{ marginTop: 16 }}>
          {t("jobs.form.backToDashboard")}
        </Link>
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
          action={<Link to="/employer-dashboard">{t("jobs.form.goToDashboard")}</Link>}
        />
      </div>
    );
  }

  // Extract plain string title and description for form editing
  const initialTitle =
    typeof job.title === "string"
      ? job.title
      : job.title?.[job.originalLanguage] || job.title?.en || job.title?.hi || job.title?.mr || "";

  const initialDescription =
    typeof job.description === "string"
      ? job.description
      : job.description?.[job.originalLanguage] ||
        job.description?.en ||
        job.description?.hi ||
        job.description?.mr ||
        "";

  const initialValues = {
    title: initialTitle,
    description: initialDescription,
    originalLanguage: job.originalLanguage || "en",
    categoryId: typeof job.categoryId === "object" ? job.categoryId?._id : job.categoryId,
    skillIds: (job.skillIds || []).map((s) => (typeof s === "object" ? s._id : s)),
    city: job.city || "",
    address: job.address || "",
    coordinates: job.location?.coordinates || null,
    payType: job.payType || "daily",
    payAmount: job.payAmount,
    requiredWorkers: job.requiredWorkers || 1,
    startDate: job.startDate,
    applicationDeadline: job.applicationDeadline,
    experienceRequired: job.experienceRequired || 0,
    preferredLanguages: job.preferredLanguages || [],
    shiftType: job.shiftType || "flexible",
    startTime: job.startTime || "",
    endTime: job.endTime || "",
  };

  return (
    <div className="container post-job-page">
      <Link
        to={`/jobs/${id}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--color-primary)",
          marginBottom: 16,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={16} aria-hidden="true" /> {t("jobs.form.backToJob")}
      </Link>

      <h1>{t("jobs.form.editTitle")}</h1>
      <p style={{ color: "var(--color-muted)", marginBottom: 20 }}>{t("jobs.form.editSubtitle")}</p>

      {error && <ErrorBanner error={error} />}

      <Card>
        <JobForm
          initialValues={initialValues}
          onSubmit={handleUpdate}
          submitLabel={t("common.saveChanges")}
          loading={saving}
          secondaryAction={
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(`/jobs/${id}`)}
              disabled={saving}
            >
              {t("common.cancel")}
            </Button>
          }
        />
      </Card>
    </div>
  );
}

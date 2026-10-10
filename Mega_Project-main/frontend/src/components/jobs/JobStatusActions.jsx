import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Sparkles,
  Edit,
  CheckCircle,
  XCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import * as jobsApi from "../../api/jobs";
import { normalizeError } from "../../api/client";
import { useLanguage } from "../../hooks/useLanguage";
import { ErrorBanner } from "../common/ErrorBanner";
import "./JobStatusActions.css";

export function JobStatusActions({ job, onActionCompleted, compact = false }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [loadingAction, setLoadingAction] = useState(null);
  const [actionError, setActionError] = useState(null);

  if (!job) return null;

  const handleClose = async () => {
    if (!window.confirm(t("jobActions.confirmClose"))) {
      return;
    }
    setLoadingAction("close");
    setActionError(null);
    try {
      await jobsApi.close(job._id);
      if (onActionCompleted) onActionCompleted("close");
    } catch (err) {
      setActionError(normalizeError(err));
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm(t("jobActions.confirmCancel"))) {
      return;
    }
    setLoadingAction("cancel");
    setActionError(null);
    try {
      await jobsApi.cancel(job._id);
      if (onActionCompleted) onActionCompleted("cancel");
    } catch (err) {
      setActionError(normalizeError(err));
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReopen = async () => {
    if (!window.confirm(t("jobActions.confirmReopen"))) {
      return;
    }
    setLoadingAction("reopen");
    setActionError(null);
    try {
      await jobsApi.reopen(job._id);
      if (onActionCompleted) onActionCompleted("reopen");
    } catch (err) {
      setActionError(normalizeError(err));
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t("jobActions.confirmDelete"))) {
      return;
    }
    setLoadingAction("delete");
    setActionError(null);
    try {
      await jobsApi.remove(job._id);
      if (onActionCompleted) onActionCompleted("delete");
    } catch (err) {
      setActionError(normalizeError(err));
    } finally {
      setLoadingAction(null);
    }
  };

  const isOpenOrPartial = job.status === "open" || job.status === "partially_assigned";
  const isInactive =
    job.status === "completed" || job.status === "cancelled" || job.status === "expired";
  const isEditable = job.status === "draft" || isOpenOrPartial || job.status === "assigned";

  return (
    <div className={`job-status-actions ${compact ? "compact" : ""}`}>
      {actionError && <ErrorBanner error={actionError} />}

      <div className="job-status-actions-buttons">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate(`/applicants/${job._id}`, { state: { job } })}
        >
          <Users size={15} aria-hidden="true" /> {t("nav.applicants")}
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            navigate(`/jobs/${job._id}/recommended-workers`, { state: { job } })
          }
        >
          <Sparkles size={15} aria-hidden="true" /> {t("recommendedWorkers.title")}
        </button>

        {isEditable && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(`/jobs/${job._id}/edit`, { state: { job } })}
          >
            <Edit size={15} aria-hidden="true" /> {t("jobs.form.editTitle")}
          </button>
        )}

        {isOpenOrPartial && (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={loadingAction !== null}
            >
              <CheckCircle size={15} aria-hidden="true" />
              {loadingAction === "close" ? t("jobActions.closing") : t("employer.dashboard.actions.close")}
            </button>

            <button
              type="button"
              className="btn btn-danger"
              onClick={handleCancel}
              disabled={loadingAction !== null}
            >
              <XCircle size={15} aria-hidden="true" />
              {loadingAction === "cancel" ? t("jobActions.cancelling") : t("jobActions.cancelJob")}
            </button>
          </>
        )}

        {isInactive && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleReopen}
            disabled={loadingAction !== null}
          >
            <RotateCcw size={15} aria-hidden="true" />
            {loadingAction === "reopen" ? t("jobActions.reopening") : t("jobActions.reopenJob")}
          </button>
        )}

        {(job.status === "draft" || isInactive) && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={loadingAction !== null}
          >
            <Trash2 size={15} aria-hidden="true" />
            {loadingAction === "delete" ? t("jobActions.deleting") : t("jobActions.delete")}
          </button>
        )}
      </div>
    </div>
  );
}

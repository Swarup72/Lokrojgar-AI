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
import "./JobStatusActions.css";

export function JobStatusActions({ job, onActionCompleted, compact = false }) {
  const navigate = useNavigate();
  const [loadingAction, setLoadingAction] = useState(null);
  const [actionError, setActionError] = useState(null);

  if (!job) return null;

  const handleClose = async () => {
    if (!window.confirm("Are you sure you want to mark this job as completed and close it?")) {
      return;
    }
    setLoadingAction("close");
    setActionError(null);
    try {
      await jobsApi.close(job._id);
      if (onActionCompleted) onActionCompleted("close");
    } catch (err) {
      setActionError(normalizeError(err)?.message || "Failed to close job");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("Are you sure you want to cancel this job?")) {
      return;
    }
    setLoadingAction("cancel");
    setActionError(null);
    try {
      await jobsApi.cancel(job._id);
      if (onActionCompleted) onActionCompleted("cancel");
    } catch (err) {
      setActionError(normalizeError(err)?.message || "Failed to cancel job");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReopen = async () => {
    if (!window.confirm("Do you want to reopen this job for applications?")) {
      return;
    }
    setLoadingAction("reopen");
    setActionError(null);
    try {
      await jobsApi.reopen(job._id);
      if (onActionCompleted) onActionCompleted("reopen");
    } catch (err) {
      setActionError(normalizeError(err)?.message || "Failed to reopen job");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to permanently delete this job?")) {
      return;
    }
    setLoadingAction("delete");
    setActionError(null);
    try {
      await jobsApi.remove(job._id);
      if (onActionCompleted) onActionCompleted("delete");
    } catch (err) {
      setActionError(normalizeError(err)?.message || "Failed to delete job");
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
      {actionError && (
        <div className="action-error-banner" role="alert">
          {actionError}
        </div>
      )}

      <div className="job-status-actions-buttons">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate(`/applicants/${job._id}`, { state: { job } })}
        >
          <Users size={15} aria-hidden="true" /> Applicants
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            navigate(`/jobs/${job._id}/recommended-workers`, { state: { job } })
          }
        >
          <Sparkles size={15} aria-hidden="true" /> Recommended Workers
        </button>

        {isEditable && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(`/jobs/${job._id}/edit`, { state: { job } })}
          >
            <Edit size={15} aria-hidden="true" /> Edit Job
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
              {loadingAction === "close" ? "Closing..." : "Close Job"}
            </button>

            <button
              type="button"
              className="btn btn-danger"
              onClick={handleCancel}
              disabled={loadingAction !== null}
            >
              <XCircle size={15} aria-hidden="true" />
              {loadingAction === "cancel" ? "Cancelling..." : "Cancel Job"}
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
            {loadingAction === "reopen" ? "Reopening..." : "Reopen Job"}
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
            {loadingAction === "delete" ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}

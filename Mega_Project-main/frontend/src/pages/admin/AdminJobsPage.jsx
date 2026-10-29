import { useState, useEffect } from "react";
import { Search, Eye, XCircle, RotateCcw, CheckCircle, Trash2, Briefcase } from "lucide-react";
import * as adminApi from "../../api/admin";
import { useLanguage } from "../../hooks/useLanguage";
import {
  AdminTable,
  AdminBadge,
  AdminPagination,
  AdminModal,
} from "../../components/admin/AdminComponents";
import "./AdminPages.css";

export function AdminJobsPage() {
  const { t, language } = useLanguage();

  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [payType, setPayType] = useState("all");

  // Inspector modal
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [jobDetails, setJobDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Moderation modal
  const [targetJob, setTargetJob] = useState(null);
  const [modAction, setModAction] = useState("cancel"); // cancel, reopen, close, delete
  const [modReason, setModReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchJobs = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 10 };
      if (search.trim()) params.search = search.trim();
      if (status !== "all") params.status = status;
      if (payType !== "all") params.payType = payType;

      const res = await adminApi.getJobs(params);
      setJobs(res.jobs || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setError(err?.message || t("admin.jobs.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs(1);
  }, [status, payType]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchJobs(1);
  };

  const openInspector = async (jobId) => {
    setSelectedJobId(jobId);
    setDetailLoading(true);
    try {
      const details = await adminApi.getJobById(jobId);
      setJobDetails(details);
    } catch (err) {
      setError(err?.message || t("admin.jobs.detailError"));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeInspector = () => {
    setSelectedJobId(null);
    setJobDetails(null);
  };

  const openModeration = (job, action) => {
    setTargetJob(job);
    setModAction(action);
    setModReason("");
  };

  const closeModeration = () => {
    setTargetJob(null);
    setModReason("");
  };

  const handleModerateSubmit = async () => {
    if (!targetJob) return;
    setActionLoading(true);
    try {
      await adminApi.moderateJob(targetJob._id, {
        action: modAction,
        reason: modReason || `Job ${modAction} applied by administrator`,
      });
      closeModeration();
      fetchJobs(pagination.page);
    } catch (err) {
      setError(err?.message || t("admin.jobs.moderateError"));
    } finally {
      setActionLoading(false);
    }
  };

  const getJobTitle = (titleObj) => {
    if (!titleObj) return "Untitled";
    return titleObj[language] || titleObj.en || titleObj.mr || titleObj.hi || "Job";
  };

  const columns = [
    {
      key: "title",
      header: t("admin.jobs.colTitle"),
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", minWidth: "160px" }}>
          <span
            style={{
              fontWeight: 600,
              color: "#0f172a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "220px",
            }}
            title={getJobTitle(row.title)}
          >
            {getJobTitle(row.title)}
          </span>
          <span
            style={{
              fontSize: "0.72rem",
              color: "#64748b",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "200px",
            }}
          >
            {row.employerId?.businessName || row.employerId?.userId?.fullName || "Employer"}
          </span>
        </div>
      ),
    },
    {
      key: "category",
      header: t("admin.jobs.colCategory"),
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", color: "#334155" }}>
          {row.categoryId?.name?.[language] || row.categoryId?.name?.en || "-"}
        </span>
      ),
    },
    {
      key: "city",
      header: t("admin.jobs.colLocation"),
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", color: "#334155" }}>
          {row.city || "-"}
        </span>
      ),
    },
    {
      key: "pay",
      header: t("admin.jobs.colWage"),
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", fontWeight: 600, color: "#0f172a", fontSize: "0.82rem" }}>
          ₹{row.payAmount} / {row.payType}
        </span>
      ),
    },
    {
      key: "workers",
      header: t("admin.jobs.colWorkers"),
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", color: "#475569" }}>
          {row.filledWorkers || 0} / {row.requiredWorkers || 1}
        </span>
      ),
    },
    {
      key: "status",
      header: t("admin.jobs.colStatus"),
      render: (row) => <AdminBadge variant={row.status}>{row.status}</AdminBadge>,
    },
    {
      key: "actions",
      header: t("admin.jobs.colActions"),
      render: (row) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
          <button
            type="button"
            className="admin-btn-sm admin-btn-outline"
            onClick={() => openInspector(row._id)}
            title={t("common.view")}
            aria-label={`${t("common.view")} ${getJobTitle(row.title)}`}
          >
            <Eye size={13} />
            <span>{t("common.view")}</span>
          </button>
          {row.status === "open" ? (
            <button
              type="button"
              className="admin-btn-sm admin-btn-danger"
              onClick={() => openModeration(row, "cancel")}
              title={t("admin.jobs.cancelJob")}
              aria-label={`${t("admin.jobs.cancelJob")} ${getJobTitle(row.title)}`}
            >
              <XCircle size={13} />
              <span>{t("common.cancel")}</span>
            </button>
          ) : (
            <button
              type="button"
              className="admin-btn-sm admin-btn-primary"
              onClick={() => openModeration(row, "reopen")}
              title={t("admin.jobs.reopenJob")}
              aria-label={`${t("admin.jobs.reopenJob")} ${getJobTitle(row.title)}`}
            >
              <RotateCcw size={13} />
              <span>{t("admin.jobs.reopenAction")}</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="admin-jobs-page page-animate">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t("admin.jobs.title")}</h2>
          <p className="admin-page-description">{t("admin.jobs.subtitle")}</p>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="admin-filters-bar">
        <form onSubmit={handleSearchSubmit} className="admin-search-input">
          <Search size={16} color="var(--color-muted)" />
          <input
            type="text"
            placeholder={t("admin.jobs.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <select
          className="admin-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={t("admin.jobs.filterStatus")}
        >
          <option value="all">{t("admin.filter.allStatuses")}</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="draft">Draft</option>
        </select>

        <select
          className="admin-select"
          value={payType}
          onChange={(e) => setPayType(e.target.value)}
          aria-label={t("admin.jobs.filterPayType")}
        >
          <option value="all">{t("admin.filter.allPayTypes")}</option>
          <option value="daily">Daily</option>
          <option value="monthly">Monthly</option>
          <option value="fixed">Fixed</option>
        </select>

        <button type="button" className="admin-btn-sm admin-btn-primary" onClick={() => fetchJobs(1)}>
          <span>{t("common.search")}</span>
        </button>
      </div>

      {/* Table */}
      <div className="admin-card">
        <AdminTable columns={columns} data={jobs} loading={loading} />
        <AdminPagination
          page={pagination.page}
          pages={pagination.pages}
          total={pagination.total}
          onPageChange={fetchJobs}
        />
      </div>

      {/* Inspector Modal */}
      <AdminModal
        isOpen={Boolean(selectedJobId)}
        onClose={closeInspector}
        title={t("admin.jobs.modalTitle")}
        footer={
          <button type="button" className="admin-btn-sm admin-btn-outline" onClick={closeInspector}>
            {t("common.close")}
          </button>
        }
      >
        {detailLoading ? (
          <p>{t("common.loading")}</p>
        ) : jobDetails ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="admin-detail-grid">
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.jobs.colTitle")}</div>
                <div className="admin-detail-val">{getJobTitle(jobDetails.job?.title)}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.jobs.colEmployer")}</div>
                <div className="admin-detail-val">
                  {jobDetails.job?.employerId?.businessName || jobDetails.job?.employerId?.userId?.fullName || "-"}
                </div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.jobs.colWage")}</div>
                <div className="admin-detail-val">
                  ₹{jobDetails.job?.payAmount} / {jobDetails.job?.payType}
                </div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.jobs.colLocation")}</div>
                <div className="admin-detail-val">{jobDetails.job?.city || "-"}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.jobs.colStatus")}</div>
                <div className="admin-detail-val">
                  <AdminBadge variant={jobDetails.job?.status}>{jobDetails.job?.status}</AdminBadge>
                </div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.jobs.colWorkers")}</div>
                <div className="admin-detail-val">
                  {jobDetails.job?.filledWorkers || 0} / {jobDetails.job?.requiredWorkers || 1}
                </div>
              </div>
            </div>

            {/* Applicants */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700 }}>
                {t("admin.jobs.applicantsTitle")} ({jobDetails.applications?.length || 0})
              </h4>
              {jobDetails.applications?.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {jobDetails.applications.map((app) => (
                    <div
                      key={app._id}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "var(--color-surface-alt)",
                        borderRadius: "var(--radius-sm)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600 }}>{app.workerId?.fullName}</span>
                        <span style={{ fontSize: "11px", color: "var(--color-muted)", marginLeft: "8px" }}>
                          {app.workerId?.userId?.phone}
                        </span>
                      </div>
                      <AdminBadge variant={app.status}>{app.status}</AdminBadge>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--color-muted)", fontSize: "13px" }}>{t("admin.jobs.noApplicants")}</p>
              )}
            </div>

            {/* Associated Disputes */}
            {jobDetails.disputes?.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700, color: "var(--color-danger)" }}>
                  {t("admin.jobs.disputesTitle")} ({jobDetails.disputes.length})
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {jobDetails.disputes.map((d) => (
                    <div
                      key={d._id}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "var(--color-danger-bg)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--color-danger-border)",
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "var(--color-danger-text)" }}>{d.reason}</div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-2)" }}>{d.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </AdminModal>

      {/* Moderation Action Modal */}
      <AdminModal
        isOpen={Boolean(targetJob)}
        onClose={closeModeration}
        title={t("admin.jobs.moderateModalTitle")}
        footer={
          <>
            <button type="button" className="admin-btn-sm admin-btn-outline" onClick={closeModeration}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className={`admin-btn-sm ${modAction === "reopen" ? "admin-btn-primary" : "admin-btn-danger"}`}
              onClick={handleModerateSubmit}
              disabled={actionLoading}
            >
              <span>{t("common.confirm")}</span>
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ margin: 0 }}>
            {t("admin.jobs.moderateActionPrompt")} <strong>{modAction}</strong>
          </p>
          <div className="admin-form-group">
            <label className="admin-form-label">{t("admin.moderation.reasonLabel")}</label>
            <textarea
              className="admin-textarea"
              placeholder={t("admin.moderation.reasonPlaceholder")}
              value={modReason}
              onChange={(e) => setModReason(e.target.value)}
            />
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Search, Eye, FileText, CheckCircle2, Clock, XCircle, ArrowUpRight } from "lucide-react";
import * as adminApi from "../../api/admin";
import { useLanguage } from "../../hooks/useLanguage";
import {
  AdminTable,
  AdminBadge,
  AdminPagination,
  AdminModal,
  AdminStatCard,
} from "../../components/admin/AdminComponents";
import "./AdminPages.css";

export function AdminApplicationsPage() {
  const { t, language } = useLanguage();

  const [applications, setApplications] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [status, setStatus] = useState("all");

  // Inspection modal
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [appDetails, setAppDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchApplications = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 10 };
      if (status !== "all") params.status = status;

      const res = await adminApi.getApplications(params);
      setApplications(res.applications || []);
      setStatusCounts(res.statusCounts || {});
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setError(err?.message || t("admin.applications.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications(1);
  }, [status]);

  const openInspector = async (id) => {
    setSelectedAppId(id);
    setDetailLoading(true);
    try {
      const details = await adminApi.getApplicationById(id);
      setAppDetails(details);
    } catch (err) {
      setError(err?.message || t("admin.applications.detailError"));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeInspector = () => {
    setSelectedAppId(null);
    setAppDetails(null);
  };

  const getJobTitle = (titleObj) => {
    if (!titleObj) return "Untitled";
    return titleObj[language] || titleObj.en || titleObj.mr || titleObj.hi || "Job";
  };

  const columns = [
    {
      key: "worker",
      header: t("admin.applications.colWorker"),
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", minWidth: "150px" }}>
          <span
            style={{
              fontWeight: 600,
              color: "#0f172a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "180px",
            }}
            title={row.workerId?.fullName || "Worker"}
          >
            {row.workerId?.fullName || "Worker"}
          </span>
          <span style={{ fontSize: "0.72rem", color: "#64748b", fontFamily: "ui-monospace, monospace" }}>
            {row.workerId?.userId?.phone || "-"}
          </span>
        </div>
      ),
    },
    {
      key: "job",
      header: t("admin.applications.colJob"),
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", minWidth: "160px" }}>
          <span
            style={{
              fontWeight: 600,
              color: "#0f172a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "200px",
            }}
            title={getJobTitle(row.jobId?.title)}
          >
            {getJobTitle(row.jobId?.title)}
          </span>
          <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
            {row.jobId?.employerId?.businessName || "-"}
          </span>
        </div>
      ),
    },
    {
      key: "initiatedBy",
      header: t("admin.applications.colInitiator"),
      render: (row) => (
        <span style={{ fontSize: "0.78rem", textTransform: "capitalize", whiteSpace: "nowrap", color: "#475569" }}>
          {row.initiatedBy || "worker"}
        </span>
      ),
    },
    {
      key: "matchScore",
      header: t("admin.applications.colMatchScore"),
      render: (row) => (
        <span style={{ fontWeight: 700, color: "#2563eb", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
          {row.matchScore != null ? `${row.matchScore}%` : "-"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: t("admin.applications.colAppliedAt"),
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", color: "#64748b", fontSize: "0.8rem" }}>
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "status",
      header: t("admin.applications.colStatus"),
      render: (row) => <AdminBadge variant={row.status}>{row.status}</AdminBadge>,
    },
    {
      key: "actions",
      header: t("admin.applications.colActions"),
      render: (row) => (
        <button
          type="button"
          className="admin-btn-sm admin-btn-outline"
          onClick={() => openInspector(row._id)}
          title={t("common.view")}
          aria-label={`${t("common.view")} application`}
        >
          <Eye size={13} />
          <span>{t("common.view")}</span>
        </button>
      ),
    },
  ];

  return (
    <div className="admin-applications-page page-animate">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t("admin.applications.title")}</h2>
          <p className="admin-page-description">{t("admin.applications.subtitle")}</p>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Status Breakdown Grid */}
      <div className="admin-stat-grid">
        <AdminStatCard
          title={t("admin.applications.statApplied")}
          value={statusCounts.applied || 0}
          icon={FileText}
          color="blue"
        />
        <AdminStatCard
          title={t("admin.applications.statInvited")}
          value={statusCounts.invited || 0}
          icon={Clock}
          color="purple"
        />
        <AdminStatCard
          title={t("admin.applications.statAccepted")}
          value={statusCounts.accepted || 0}
          icon={CheckCircle2}
          color="green"
        />
        <AdminStatCard
          title={t("admin.applications.statCompleted")}
          value={statusCounts.completed || 0}
          icon={CheckCircle2}
          color="green"
        />
      </div>

      {/* Filter Bar */}
      <div className="admin-filters-bar">
        <select
          className="admin-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={t("admin.applications.filterStatus")}
        >
          <option value="all">{t("admin.filter.allStatuses")}</option>
          <option value="applied">Applied</option>
          <option value="invited">Invited</option>
          <option value="shortlisted">Shortlisted</option>
          <option value="accepted">Accepted</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
          <option value="declined">Declined</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {/* Table */}
      <div className="admin-card">
        <AdminTable columns={columns} data={applications} loading={loading} />
        <AdminPagination
          page={pagination.page}
          pages={pagination.pages}
          total={pagination.total}
          onPageChange={fetchApplications}
        />
      </div>

      {/* Inspection Modal */}
      <AdminModal
        isOpen={Boolean(selectedAppId)}
        onClose={closeInspector}
        title={t("admin.applications.modalTitle")}
        footer={
          <button type="button" className="admin-btn-sm admin-btn-outline" onClick={closeInspector}>
            {t("common.close")}
          </button>
        }
      >
        {detailLoading ? (
          <p>{t("common.loading")}</p>
        ) : appDetails ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="admin-detail-grid">
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.applications.colWorker")}</div>
                <div className="admin-detail-val">{appDetails.workerId?.fullName}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.applications.colJob")}</div>
                <div className="admin-detail-val">{getJobTitle(appDetails.jobId?.title)}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.applications.colStatus")}</div>
                <div className="admin-detail-val">
                  <AdminBadge variant={appDetails.status}>{appDetails.status}</AdminBadge>
                </div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.applications.colMatchScore")}</div>
                <div className="admin-detail-val">
                  {appDetails.matchScore != null ? `${appDetails.matchScore}%` : "-"}
                </div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.applications.proposedPay")}</div>
                <div className="admin-detail-val">₹{appDetails.proposedPay || appDetails.jobId?.payAmount || 0}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.applications.colInitiator")}</div>
                <div className="admin-detail-val">{appDetails.initiatedBy}</div>
              </div>
            </div>

            {/* Match Factors breakdown */}
            {appDetails.matchFactors && (
              <div>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700 }}>
                  {t("admin.applications.matchFactorsTitle")}
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {Object.entries(appDetails.matchFactors).map(([factor, score]) => (
                    <div
                      key={factor}
                      style={{
                        padding: "6px 10px",
                        backgroundColor: "var(--color-surface-alt)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "12px",
                      }}
                    >
                      <span style={{ textTransform: "capitalize", color: "var(--color-muted)" }}>{factor}: </span>
                      <span style={{ fontWeight: 700 }}>{score}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cover Note */}
            {appDetails.coverNote && (
              <div>
                <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 700 }}>
                  {t("admin.applications.coverNoteTitle")}
                </h4>
                <p style={{ margin: 0, padding: "8px 12px", backgroundColor: "var(--color-surface-alt)", borderRadius: "var(--radius-sm)" }}>
                  {appDetails.coverNote}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </AdminModal>
    </div>
  );
}

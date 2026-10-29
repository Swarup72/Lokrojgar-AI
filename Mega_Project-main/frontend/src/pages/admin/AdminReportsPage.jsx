import { useState, useEffect } from "react";
import { Search, Eye, AlertTriangle, CheckCircle2, Clock, ShieldAlert, FileText } from "lucide-react";
import * as adminApi from "../../api/admin";
import { useLanguage } from "../../hooks/useLanguage";
import {
  AdminTable,
  AdminBadge,
  AdminPagination,
  AdminModal,
} from "../../components/admin/AdminComponents";
import "./AdminPages.css";

export function AdminReportsPage() {
  const { t, language } = useLanguage();

  const [disputes, setDisputes] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  // Inspection modal
  const [selectedDisputeId, setSelectedDisputeId] = useState(null);
  const [disputeDetails, setDisputeDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Status transition modal
  const [targetDispute, setTargetDispute] = useState(null);
  const [newStatus, setNewStatus] = useState("resolved");
  const [resolutionNote, setResolutionNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDisputes = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 10 };
      if (status !== "all") params.status = status;
      if (search.trim()) params.search = search.trim();

      const res = await adminApi.getDisputes(params);
      setDisputes(res.disputes || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setError(err?.message || t("admin.reports.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes(1);
  }, [status]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchDisputes(1);
  };

  const openInspector = async (id) => {
    setSelectedDisputeId(id);
    setDetailLoading(true);
    try {
      const details = await adminApi.getDisputeById(id);
      setDisputeDetails(details);
    } catch (err) {
      setError(err?.message || t("admin.reports.detailError"));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeInspector = () => {
    setSelectedDisputeId(null);
    setDisputeDetails(null);
  };

  const openStatusModal = (dispute) => {
    setTargetDispute(dispute);
    setNewStatus(dispute.status === "open" ? "under_review" : "resolved");
    setResolutionNote(dispute.resolutionNote || "");
  };

  const closeStatusModal = () => {
    setTargetDispute(null);
    setResolutionNote("");
  };

  const handleStatusSubmit = async () => {
    if (!targetDispute) return;
    setActionLoading(true);
    try {
      await adminApi.updateDisputeStatus(targetDispute._id, {
        status: newStatus,
        resolutionNote: resolutionNote.trim(),
      });
      closeStatusModal();
      fetchDisputes(pagination.page);
    } catch (err) {
      setError(err?.message || t("admin.reports.statusError"));
    } finally {
      setActionLoading(false);
    }
  };

  const getJobTitle = (titleObj) => {
    if (!titleObj) return "Job";
    return titleObj[language] || titleObj.en || titleObj.mr || titleObj.hi || "Job";
  };

  const columns = [
    {
      key: "job",
      header: t("admin.reports.colJob"),
      render: (row) => (
        <span
          style={{
            fontWeight: 600,
            color: "#0f172a",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "180px",
            display: "inline-block",
          }}
          title={getJobTitle(row.jobId?.title)}
        >
          {getJobTitle(row.jobId?.title)}
        </span>
      ),
    },
    {
      key: "raisedBy",
      header: t("admin.reports.colRaisedBy"),
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", color: "#334155" }}>
          {row.raisedByUserId?.fullName || row.raisedByUserId?.phone || "User"}
        </span>
      ),
    },
    {
      key: "against",
      header: t("admin.reports.colAgainst"),
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", color: "#334155" }}>
          {row.againstUserId?.fullName || row.againstUserId?.phone || "User"}
        </span>
      ),
    },
    {
      key: "reason",
      header: t("admin.reports.colReason"),
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", minWidth: "150px" }}>
          <span style={{ fontWeight: 600, color: "#0f172a" }}>{row.reason}</span>
          <span
            style={{
              fontSize: "0.72rem",
              color: "#64748b",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "220px",
            }}
            title={row.description}
          >
            {row.description ? `${row.description.slice(0, 50)}...` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: t("admin.reports.colDate"),
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", color: "#64748b", fontSize: "0.8rem" }}>
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "status",
      header: t("admin.reports.colStatus"),
      render: (row) => <AdminBadge variant={row.status}>{row.status}</AdminBadge>,
    },
    {
      key: "actions",
      header: t("admin.reports.colActions"),
      render: (row) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
          <button
            type="button"
            className="admin-btn-sm admin-btn-outline"
            onClick={() => openInspector(row._id)}
            title={t("common.view")}
            aria-label={`${t("common.view")} dispute`}
          >
            <Eye size={13} />
            <span>{t("common.view")}</span>
          </button>
          <button
            type="button"
            className="admin-btn-sm admin-btn-primary"
            onClick={() => openStatusModal(row)}
            title={t("admin.reports.updateStatus")}
            aria-label={`${t("admin.reports.updateStatus")} dispute`}
          >
            <span>{t("admin.reports.actionUpdate")}</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="admin-reports-page page-animate">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t("admin.reports.title")}</h2>
          <p className="admin-page-description">{t("admin.reports.subtitle")}</p>
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
            placeholder={t("admin.reports.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <select
          className="admin-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={t("admin.reports.filterStatus")}
        >
          <option value="all">{t("admin.filter.allStatuses")}</option>
          <option value="open">Open</option>
          <option value="under_review">Under Review</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>

        <button type="button" className="admin-btn-sm admin-btn-primary" onClick={() => fetchDisputes(1)}>
          <span>{t("common.search")}</span>
        </button>
      </div>

      {/* Table */}
      <div className="admin-card">
        <AdminTable columns={columns} data={disputes} loading={loading} />
        <AdminPagination
          page={pagination.page}
          pages={pagination.pages}
          total={pagination.total}
          onPageChange={fetchDisputes}
        />
      </div>

      {/* Detail Inspection Modal */}
      <AdminModal
        isOpen={Boolean(selectedDisputeId)}
        onClose={closeInspector}
        title={t("admin.reports.modalTitle")}
        footer={
          <button type="button" className="admin-btn-sm admin-btn-outline" onClick={closeInspector}>
            {t("common.close")}
          </button>
        }
      >
        {detailLoading ? (
          <p>{t("common.loading")}</p>
        ) : disputeDetails ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="admin-detail-grid">
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.reports.colJob")}</div>
                <div className="admin-detail-val">{getJobTitle(disputeDetails.jobId?.title)}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.reports.colStatus")}</div>
                <div className="admin-detail-val">
                  <AdminBadge variant={disputeDetails.status}>{disputeDetails.status}</AdminBadge>
                </div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.reports.colRaisedBy")}</div>
                <div className="admin-detail-val">
                  {disputeDetails.raisedByUserId?.fullName || "-"} ({disputeDetails.raisedByUserId?.phone})
                </div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.reports.colAgainst")}</div>
                <div className="admin-detail-val">
                  {disputeDetails.againstUserId?.fullName || "-"} ({disputeDetails.againstUserId?.phone})
                </div>
              </div>
            </div>

            {/* Reason & Description */}
            <div style={{ backgroundColor: "var(--color-surface-alt)", padding: "12px", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>{disputeDetails.reason}</div>
              <p style={{ margin: 0, fontSize: "13px" }}>{disputeDetails.description}</p>
            </div>

            {/* Evidence items if any */}
            {disputeDetails.evidence?.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700 }}>
                  {t("admin.reports.evidenceTitle")}
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {disputeDetails.evidence.map((url, idx) => (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="admin-btn-sm admin-btn-outline"
                    >
                      <FileText size={13} />
                      <span>{t("admin.reports.viewEvidence")} {idx + 1}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Resolution Note if present */}
            {disputeDetails.resolutionNote && (
              <div style={{ backgroundColor: "var(--color-success-bg-soft)", border: "1px solid var(--color-success-bg)", padding: "12px", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontWeight: 700, color: "var(--color-success-text)", marginBottom: "4px" }}>
                  {t("admin.reports.resolutionNoteTitle")}
                </div>
                <p style={{ margin: 0, fontSize: "13px" }}>{disputeDetails.resolutionNote}</p>
                {disputeDetails.resolvedByAdminId && (
                  <div style={{ fontSize: "11px", color: "var(--color-muted)", marginTop: "6px" }}>
                    {t("admin.reports.resolvedBy")}: {disputeDetails.resolvedByAdminId.fullName || "Admin"}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </AdminModal>

      {/* Status Update Modal */}
      <AdminModal
        isOpen={Boolean(targetDispute)}
        onClose={closeStatusModal}
        title={t("admin.reports.updateStatusTitle")}
        footer={
          <>
            <button type="button" className="admin-btn-sm admin-btn-outline" onClick={closeStatusModal}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="admin-btn-sm admin-btn-primary"
              onClick={handleStatusSubmit}
              disabled={actionLoading}
            >
              <span>{t("common.submit")}</span>
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className="admin-form-group">
            <label className="admin-form-label">{t("admin.reports.colStatus")}</label>
            <select
              className="admin-select"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              <option value="open">Open</option>
              <option value="under_review">Under Review</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">{t("admin.reports.resolutionNoteTitle")}</label>
            <textarea
              className="admin-textarea"
              placeholder={t("admin.reports.resolutionNotePlaceholder")}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
            />
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

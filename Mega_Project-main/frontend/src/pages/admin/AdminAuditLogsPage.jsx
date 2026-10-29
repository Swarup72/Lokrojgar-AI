import { useState, useEffect } from "react";
import { ScrollText, Eye, Shield, Filter, Search } from "lucide-react";
import * as adminApi from "../../api/admin";
import { useLanguage } from "../../hooks/useLanguage";
import {
  AdminTable,
  AdminBadge,
  AdminPagination,
  AdminModal,
} from "../../components/admin/AdminComponents";
import "./AdminPages.css";

export function AdminAuditLogsPage() {
  const { t } = useLanguage();

  const [logs, setLogs] = useState([]);
  const [actionTypes, setActionTypes] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter
  const [actionType, setActionType] = useState("all");

  // Inspection modal
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 15 };
      if (actionType !== "all") params.actionType = actionType;

      const res = await adminApi.getAuditLogs(params);
      setLogs(res.logs || []);
      setActionTypes(res.actionTypes || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setError(err?.message || t("admin.audit.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [actionType]);

  const columns = [
    {
      key: "createdAt",
      header: t("admin.audit.colDate"),
      render: (row) => (
        <span style={{ fontSize: "0.78rem", whiteSpace: "nowrap", color: "#64748b" }}>
          {new Date(row.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: "actionType",
      header: t("admin.audit.colAction"),
      render: (row) => <AdminBadge variant="info">{row.actionType}</AdminBadge>,
    },
    {
      key: "admin",
      header: t("admin.audit.colAdmin"),
      render: (row) => (
        <span style={{ fontWeight: 600, whiteSpace: "nowrap", color: "#0f172a" }}>
          {row.adminId?.fullName || row.adminId?.phone || "Administrator"}
        </span>
      ),
    },
    {
      key: "target",
      header: t("admin.audit.colTarget"),
      render: (row) => {
        if (row.targetUserId) {
          return (
            <span style={{ whiteSpace: "nowrap", color: "#334155" }}>
              User: {row.targetUserId.fullName || row.targetUserId.phone}
            </span>
          );
        }
        if (row.targetJobId) {
          return (
            <span style={{ whiteSpace: "nowrap", color: "#334155" }}>
              Job: {row.targetJobId.title?.en || "Job Posting"}
            </span>
          );
        }
        return <span style={{ color: "#94a3b8" }}>-</span>;
      },
    },
    {
      key: "details",
      header: t("admin.audit.colDetails"),
      render: (row) => (
        <div style={{ maxWidth: "280px" }}>
          <span
            style={{
              fontSize: "0.82rem",
              color: "#475569",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "block",
            }}
            title={row.details || ""}
          >
            {row.details || "-"}
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      header: t("admin.audit.colActions"),
      render: (row) => (
        <button
          type="button"
          className="admin-btn-sm admin-btn-outline"
          onClick={() => setSelectedLog(row)}
          title={t("common.view")}
          aria-label={`${t("common.view")} audit log`}
        >
          <Eye size={13} />
          <span>{t("common.view")}</span>
        </button>
      ),
    },
  ];

  return (
    <div className="admin-audit-logs-page page-animate">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t("admin.audit.title")}</h2>
          <p className="admin-page-description">{t("admin.audit.subtitle")}</p>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="admin-filters-bar">
        <select
          className="admin-select"
          value={actionType}
          onChange={(e) => setActionType(e.target.value)}
          aria-label={t("admin.audit.filterActionType")}
        >
          <option value="all">{t("admin.audit.allActionTypes")}</option>
          {actionTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="admin-card">
        <AdminTable columns={columns} data={logs} loading={loading} />
        <AdminPagination
          page={pagination.page}
          pages={pagination.pages}
          total={pagination.total}
          onPageChange={fetchLogs}
        />
      </div>

      {/* Inspection Modal */}
      <AdminModal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={t("admin.audit.modalTitle")}
        footer={
          <button type="button" className="admin-btn-sm admin-btn-outline" onClick={() => setSelectedLog(null)}>
            {t("common.close")}
          </button>
        }
      >
        {selectedLog && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="admin-detail-grid">
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.audit.colAction")}</div>
                <div className="admin-detail-val">{selectedLog.actionType}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.audit.colDate")}</div>
                <div className="admin-detail-val">{new Date(selectedLog.createdAt).toLocaleString()}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.audit.colAdmin")}</div>
                <div className="admin-detail-val">
                  {selectedLog.adminId?.fullName || selectedLog.adminId?.phone || "Admin"}
                </div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.audit.colTarget")}</div>
                <div className="admin-detail-val">
                  {selectedLog.targetUserId
                    ? `User: ${selectedLog.targetUserId.fullName || selectedLog.targetUserId.phone}`
                    : selectedLog.targetJobId
                    ? "Job Entity"
                    : "System"}
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: "var(--color-surface-alt)", padding: "12px", borderRadius: "var(--radius-sm)" }}>
              <div className="admin-detail-label">{t("admin.audit.colDetails")}</div>
              <div style={{ fontWeight: 600, fontSize: "14px" }}>{selectedLog.details || "No details provided"}</div>
            </div>

            {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700 }}>
                  {t("admin.audit.metadataTitle")}
                </h4>
                <pre
                  style={{
                    backgroundColor: "var(--color-surface-alt)",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    overflowX: "auto",
                    margin: 0,
                  }}
                >
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </AdminModal>
    </div>
  );
}

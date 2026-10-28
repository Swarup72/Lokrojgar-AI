import { useState, useEffect } from "react";
import { Search, Eye, AlertOctagon, CheckCircle2, Star, User } from "lucide-react";
import * as adminApi from "../../api/admin";
import { useLanguage } from "../../hooks/useLanguage";
import {
  AdminTable,
  AdminBadge,
  AdminPagination,
  AdminModal,
  AdminConfirmDialog,
} from "../../components/admin/AdminComponents";
import "./AdminPages.css";

export function AdminWorkersPage() {
  const { t } = useLanguage();

  const [workers, setWorkers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter states
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [availability, setAvailability] = useState("all");

  // Inspection modal state
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [workerDetails, setWorkerDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Status toggle confirmation dialog
  const [targetWorker, setTargetWorker] = useState(null);
  const [blockReason, setBlockReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchWorkers = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 10 };
      if (search.trim()) params.search = search.trim();
      if (status !== "all") params.status = status;
      if (availability !== "all") params.availability = availability;

      const res = await adminApi.getWorkers(params);
      setWorkers(res.workers || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setError(err?.message || t("admin.workers.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers(1);
  }, [status, availability]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchWorkers(1);
  };

  const openInspector = async (workerId) => {
    setSelectedWorkerId(workerId);
    setDetailLoading(true);
    try {
      const details = await adminApi.getWorkerById(workerId);
      setWorkerDetails(details);
    } catch (err) {
      setError(err?.message || t("admin.workers.detailError"));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeInspector = () => {
    setSelectedWorkerId(null);
    setWorkerDetails(null);
  };

  const openConfirmStatus = (worker) => {
    setTargetWorker(worker);
    setBlockReason("");
  };

  const closeConfirmStatus = () => {
    setTargetWorker(null);
    setBlockReason("");
  };

  const handleStatusChange = async () => {
    if (!targetWorker) return;
    setActionLoading(true);
    try {
      const newBlockedState = !targetWorker.userId?.isBlocked;
      await adminApi.updateWorkerStatus(targetWorker._id, {
        isBlocked: newBlockedState,
        reason: blockReason || (newBlockedState ? "Suspended by administrator" : "Reactivated by administrator"),
      });
      closeConfirmStatus();
      fetchWorkers(pagination.page);
    } catch (err) {
      setError(err?.message || t("admin.workers.statusError"));
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      key: "fullName",
      header: t("admin.workers.colName"),
      render: (row) => (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              backgroundColor: "var(--color-primary-50)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary)",
              overflow: "hidden",
            }}
          >
            {row.profilePhoto ? (
              <img src={row.profilePhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <User size={16} />
            )}
          </div>
          <span style={{ fontWeight: 600 }}>{row.fullName}</span>
        </div>
      ),
    },
    {
      key: "phone",
      header: t("admin.workers.colPhone"),
      render: (row) => row.userId?.phone || "-",
    },
    {
      key: "city",
      header: t("admin.workers.colCity"),
      render: (row) => row.city || "-",
    },
    {
      key: "availability",
      header: t("admin.workers.colAvailability"),
      render: (row) => <AdminBadge variant={row.availability}>{row.availability}</AdminBadge>,
    },
    {
      key: "ratingAvg",
      header: t("admin.workers.colRating"),
      render: (row) => (
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Star size={14} color="#f59e0b" fill="#f59e0b" />
          <span>{row.ratingAvg ? row.ratingAvg.toFixed(1) : "New"}</span>
          <span style={{ color: "var(--color-muted)", fontSize: "11px" }}>({row.ratingCount || 0})</span>
        </div>
      ),
    },
    {
      key: "status",
      header: t("admin.workers.colStatus"),
      render: (row) => (
        <AdminBadge variant={row.userId?.isBlocked ? "blocked" : "active"}>
          {row.userId?.isBlocked ? t("admin.status.suspended") : t("admin.status.active")}
        </AdminBadge>
      ),
    },
    {
      key: "actions",
      header: t("admin.workers.colActions"),
      render: (row) => (
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            className="admin-btn-sm admin-btn-outline"
            onClick={() => openInspector(row._id)}
            title={t("common.view")}
          >
            <Eye size={13} />
            <span>{t("common.view")}</span>
          </button>
          <button
            type="button"
            className={`admin-btn-sm ${row.userId?.isBlocked ? "admin-btn-primary" : "admin-btn-danger"}`}
            onClick={() => openConfirmStatus(row)}
          >
            {row.userId?.isBlocked ? <CheckCircle2 size={13} /> : <AlertOctagon size={13} />}
            <span>{row.userId?.isBlocked ? t("admin.actions.activate") : t("admin.actions.suspend")}</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="admin-workers-page page-animate">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t("admin.workers.title")}</h2>
          <p className="admin-page-description">{t("admin.workers.subtitle")}</p>
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
            placeholder={t("admin.workers.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <select
          className="admin-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={t("admin.workers.filterStatus")}
        >
          <option value="all">{t("admin.filter.allStatuses")}</option>
          <option value="active">{t("admin.status.active")}</option>
          <option value="blocked">{t("admin.status.suspended")}</option>
        </select>

        <select
          className="admin-select"
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
          aria-label={t("admin.workers.filterAvailability")}
        >
          <option value="all">{t("admin.filter.allAvailability")}</option>
          <option value="available">Available</option>
          <option value="busy">Busy</option>
          <option value="unavailable">Unavailable</option>
        </select>

        <button type="button" className="admin-btn-sm admin-btn-primary" onClick={() => fetchWorkers(1)}>
          <span>{t("common.search")}</span>
        </button>
      </div>

      {/* Data Table */}
      <div className="admin-card">
        <AdminTable columns={columns} data={workers} loading={loading} />
        <AdminPagination
          page={pagination.page}
          pages={pagination.pages}
          total={pagination.total}
          onPageChange={fetchWorkers}
        />
      </div>

      {/* Worker Inspector Modal */}
      <AdminModal
        isOpen={Boolean(selectedWorkerId)}
        onClose={closeInspector}
        title={t("admin.workers.modalTitle")}
        footer={
          <button type="button" className="admin-btn-sm admin-btn-outline" onClick={closeInspector}>
            {t("common.close")}
          </button>
        }
      >
        {detailLoading ? (
          <p>{t("common.loading")}</p>
        ) : workerDetails ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="admin-detail-grid">
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.workers.colName")}</div>
                <div className="admin-detail-val">{workerDetails.worker?.fullName}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.workers.colPhone")}</div>
                <div className="admin-detail-val">{workerDetails.worker?.userId?.phone}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.workers.colCity")}</div>
                <div className="admin-detail-val">{workerDetails.worker?.city || "-"}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.workers.colAvailability")}</div>
                <div className="admin-detail-val">{workerDetails.worker?.availability}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.workers.experience")}</div>
                <div className="admin-detail-val">
                  {workerDetails.worker?.experienceYears || 0} {t("admin.workers.years")}
                </div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.workers.expectedPay")}</div>
                <div className="admin-detail-val">₹{workerDetails.worker?.expectedPay || 0}</div>
              </div>
            </div>

            {/* Verified Skills */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700 }}>
                {t("admin.workers.skillsTitle")}
              </h4>
              {workerDetails.skills?.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {workerDetails.skills.map((s) => (
                    <AdminBadge key={s._id} variant={s.verificationStatus === "verified" ? "verified" : "pending"}>
                      {s.skillId?.name?.en || s.skillId?.name?.mr || "Skill"} ({s.proficiencyLevel || "intermediate"})
                    </AdminBadge>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--color-muted)", fontSize: "13px" }}>{t("admin.workers.noSkills")}</p>
              )}
            </div>

            {/* Recent Applications */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700 }}>
                {t("admin.workers.recentApplicationsTitle")}
              </h4>
              {workerDetails.applications?.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {workerDetails.applications.map((app) => (
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
                      <span style={{ fontWeight: 600 }}>{app.jobId?.title?.en || app.jobId?.title?.mr || "Job"}</span>
                      <AdminBadge variant={app.status}>{app.status}</AdminBadge>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--color-muted)", fontSize: "13px" }}>{t("admin.workers.noApplications")}</p>
              )}
            </div>
          </div>
        ) : null}
      </AdminModal>

      {/* Confirm Suspend / Reactivate Dialog */}
      <AdminModal
        isOpen={Boolean(targetWorker)}
        onClose={closeConfirmStatus}
        title={
          targetWorker?.userId?.isBlocked ? t("admin.workers.confirmActivate") : t("admin.workers.confirmSuspend")
        }
        footer={
          <>
            <button type="button" className="admin-btn-sm admin-btn-outline" onClick={closeConfirmStatus}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className={`admin-btn-sm ${targetWorker?.userId?.isBlocked ? "admin-btn-primary" : "admin-btn-danger"}`}
              onClick={handleStatusChange}
              disabled={actionLoading}
            >
              <span>{t("common.confirm")}</span>
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ margin: 0 }}>
            {targetWorker?.userId?.isBlocked
              ? t("admin.workers.reactivatePrompt")
              : t("admin.workers.suspendPrompt")}
          </p>
          <div className="admin-form-group">
            <label className="admin-form-label">{t("admin.moderation.reasonLabel")}</label>
            <textarea
              className="admin-textarea"
              placeholder={t("admin.moderation.reasonPlaceholder")}
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
            />
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Search, Eye, AlertOctagon, CheckCircle2, BadgeCheck, ShieldAlert, Building2 } from "lucide-react";
import * as adminApi from "../../api/admin";
import { useLanguage } from "../../hooks/useLanguage";
import {
  AdminTable,
  AdminBadge,
  AdminPagination,
  AdminModal,
} from "../../components/admin/AdminComponents";
import "./AdminPages.css";

export function AdminEmployersPage() {
  const { t } = useLanguage();

  const [employers, setEmployers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [isVerified, setIsVerified] = useState("all");

  // Inspector modal
  const [selectedEmployerId, setSelectedEmployerId] = useState(null);
  const [employerDetails, setEmployerDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Verification modal
  const [targetVerifyEmployer, setTargetVerifyEmployer] = useState(null);
  const [verifyReason, setVerifyReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Suspend modal
  const [targetSuspendEmployer, setTargetSuspendEmployer] = useState(null);
  const [suspendReason, setSuspendReason] = useState("");

  const fetchEmployers = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 10 };
      if (search.trim()) params.search = search.trim();
      if (status !== "all") params.status = status;
      if (isVerified !== "all") params.isVerified = isVerified;

      const res = await adminApi.getEmployers(params);
      setEmployers(res.employers || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setError(err?.message || t("admin.employers.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployers(1);
  }, [status, isVerified]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchEmployers(1);
  };

  const openInspector = async (employerId) => {
    setSelectedEmployerId(employerId);
    setDetailLoading(true);
    try {
      const details = await adminApi.getEmployerById(employerId);
      setEmployerDetails(details);
    } catch (err) {
      setError(err?.message || t("admin.employers.detailError"));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeInspector = () => {
    setSelectedEmployerId(null);
    setEmployerDetails(null);
  };

  const handleVerificationChange = async (newVerifiedState) => {
    if (!targetVerifyEmployer) return;
    setActionLoading(true);
    try {
      await adminApi.verifyEmployer(targetVerifyEmployer._id, {
        isVerified: newVerifiedState,
        reason: verifyReason || (newVerifiedState ? "Verified by administrator" : "Verification rejected/revoked"),
      });
      setTargetVerifyEmployer(null);
      setVerifyReason("");
      fetchEmployers(pagination.page);
    } catch (err) {
      setError(err?.message || t("admin.employers.verifyError"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async () => {
    if (!targetSuspendEmployer) return;
    setActionLoading(true);
    try {
      const newBlockedState = !targetSuspendEmployer.userId?.isBlocked;
      await adminApi.updateEmployerStatus(targetSuspendEmployer._id, {
        isBlocked: newBlockedState,
        reason: suspendReason || (newBlockedState ? "Suspended by administrator" : "Reactivated by administrator"),
      });
      setTargetSuspendEmployer(null);
      setSuspendReason("");
      fetchEmployers(pagination.page);
    } catch (err) {
      setError(err?.message || t("admin.employers.statusError"));
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      key: "businessName",
      header: t("admin.employers.colBusiness"),
      render: (row) => (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-primary-50)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary)",
            }}
          >
            <Building2 size={16} />
          </div>
          <div>
            <span style={{ fontWeight: 600, display: "block" }}>
              {row.businessName || row.userId?.fullName || "Employer"}
            </span>
            <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>{row.businessType || "-"}</span>
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: t("admin.employers.colContact"),
      render: (row) => (
        <div>
          <div>{row.userId?.phone || "-"}</div>
          {row.userId?.email && <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>{row.userId.email}</div>}
        </div>
      ),
    },
    {
      key: "city",
      header: t("admin.employers.colCity"),
      render: (row) => row.city || "-",
    },
    {
      key: "isVerified",
      header: t("admin.employers.colVerified"),
      render: (row) => (
        <AdminBadge variant={row.isVerified ? "verified" : "pending"}>
          {row.isVerified ? t("admin.status.verified") : t("admin.status.unverified")}
        </AdminBadge>
      ),
    },
    {
      key: "status",
      header: t("admin.employers.colStatus"),
      render: (row) => (
        <AdminBadge variant={row.userId?.isBlocked ? "blocked" : "active"}>
          {row.userId?.isBlocked ? t("admin.status.suspended") : t("admin.status.active")}
        </AdminBadge>
      ),
    },
    {
      key: "actions",
      header: t("admin.employers.colActions"),
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
            className="admin-btn-sm admin-btn-outline"
            onClick={() => {
              setTargetVerifyEmployer(row);
              setVerifyReason("");
            }}
            title={t("admin.employers.verifyAction")}
          >
            <BadgeCheck size={13} color="var(--color-primary)" />
            <span>{row.isVerified ? t("admin.actions.unverify") : t("admin.actions.verify")}</span>
          </button>
          <button
            type="button"
            className={`admin-btn-sm ${row.userId?.isBlocked ? "admin-btn-primary" : "admin-btn-danger"}`}
            onClick={() => {
              setTargetSuspendEmployer(row);
              setSuspendReason("");
            }}
          >
            {row.userId?.isBlocked ? <CheckCircle2 size={13} /> : <AlertOctagon size={13} />}
            <span>{row.userId?.isBlocked ? t("admin.actions.activate") : t("admin.actions.suspend")}</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="admin-employers-page page-animate">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t("admin.employers.title")}</h2>
          <p className="admin-page-description">{t("admin.employers.subtitle")}</p>
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
            placeholder={t("admin.employers.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <select
          className="admin-select"
          value={isVerified}
          onChange={(e) => setIsVerified(e.target.value)}
          aria-label={t("admin.employers.filterVerification")}
        >
          <option value="all">{t("admin.filter.allVerification")}</option>
          <option value="true">{t("admin.status.verified")}</option>
          <option value="false">{t("admin.status.unverified")}</option>
        </select>

        <select
          className="admin-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={t("admin.employers.filterStatus")}
        >
          <option value="all">{t("admin.filter.allStatuses")}</option>
          <option value="active">{t("admin.status.active")}</option>
          <option value="blocked">{t("admin.status.suspended")}</option>
        </select>

        <button type="button" className="admin-btn-sm admin-btn-primary" onClick={() => fetchEmployers(1)}>
          <span>{t("common.search")}</span>
        </button>
      </div>

      {/* Table */}
      <div className="admin-card">
        <AdminTable columns={columns} data={employers} loading={loading} />
        <AdminPagination
          page={pagination.page}
          pages={pagination.pages}
          total={pagination.total}
          onPageChange={fetchEmployers}
        />
      </div>

      {/* Inspector Modal */}
      <AdminModal
        isOpen={Boolean(selectedEmployerId)}
        onClose={closeInspector}
        title={t("admin.employers.modalTitle")}
        footer={
          <button type="button" className="admin-btn-sm admin-btn-outline" onClick={closeInspector}>
            {t("common.close")}
          </button>
        }
      >
        {detailLoading ? (
          <p>{t("common.loading")}</p>
        ) : employerDetails ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="admin-detail-grid">
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.employers.colBusiness")}</div>
                <div className="admin-detail-val">{employerDetails.employer?.businessName || "-"}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.employers.contactPerson")}</div>
                <div className="admin-detail-val">{employerDetails.employer?.userId?.fullName || "-"}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.employers.colContact")}</div>
                <div className="admin-detail-val">{employerDetails.employer?.userId?.phone}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.employers.colCity")}</div>
                <div className="admin-detail-val">{employerDetails.employer?.city || "-"}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.employers.totalJobsPosted")}</div>
                <div className="admin-detail-val">{employerDetails.stats?.totalJobs || 0}</div>
              </div>
              <div className="admin-detail-item">
                <div className="admin-detail-label">{t("admin.employers.activeJobs")}</div>
                <div className="admin-detail-val">{employerDetails.stats?.activeJobs || 0}</div>
              </div>
            </div>

            {/* Recent Jobs */}
            <div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700 }}>
                {t("admin.employers.recentJobsTitle")}
              </h4>
              {employerDetails.recentJobs?.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {employerDetails.recentJobs.map((job) => (
                    <div
                      key={job._id}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "var(--color-surface-alt)",
                        borderRadius: "var(--radius-sm)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{job.title?.en || job.title?.mr || "Job"}</span>
                      <AdminBadge variant={job.status}>{job.status}</AdminBadge>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--color-muted)", fontSize: "13px" }}>{t("admin.employers.noJobs")}</p>
              )}
            </div>
          </div>
        ) : null}
      </AdminModal>

      {/* Verification Dialog */}
      <AdminModal
        isOpen={Boolean(targetVerifyEmployer)}
        onClose={() => setTargetVerifyEmployer(null)}
        title={t("admin.employers.verificationDialogTitle")}
        footer={
          <>
            <button
              type="button"
              className="admin-btn-sm admin-btn-outline"
              onClick={() => setTargetVerifyEmployer(null)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="admin-btn-sm admin-btn-danger"
              onClick={() => handleVerificationChange(false)}
              disabled={actionLoading}
            >
              <span>{t("admin.actions.unverify")}</span>
            </button>
            <button
              type="button"
              className="admin-btn-sm admin-btn-primary"
              onClick={() => handleVerificationChange(true)}
              disabled={actionLoading}
            >
              <span>{t("admin.actions.verify")}</span>
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ margin: 0 }}>
            {t("admin.employers.verificationPrompt")} <strong>{targetVerifyEmployer?.businessName}</strong>
          </p>
          <div className="admin-form-group">
            <label className="admin-form-label">{t("admin.moderation.reasonLabel")}</label>
            <textarea
              className="admin-textarea"
              placeholder={t("admin.moderation.reasonPlaceholder")}
              value={verifyReason}
              onChange={(e) => setVerifyReason(e.target.value)}
            />
          </div>
        </div>
      </AdminModal>

      {/* Suspend Confirmation Dialog */}
      <AdminModal
        isOpen={Boolean(targetSuspendEmployer)}
        onClose={() => setTargetSuspendEmployer(null)}
        title={
          targetSuspendEmployer?.userId?.isBlocked
            ? t("admin.employers.confirmActivate")
            : t("admin.employers.confirmSuspend")
        }
        footer={
          <>
            <button
              type="button"
              className="admin-btn-sm admin-btn-outline"
              onClick={() => setTargetSuspendEmployer(null)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className={`admin-btn-sm ${targetSuspendEmployer?.userId?.isBlocked ? "admin-btn-primary" : "admin-btn-danger"}`}
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
            {targetSuspendEmployer?.userId?.isBlocked
              ? t("admin.employers.reactivatePrompt")
              : t("admin.employers.suspendPrompt")}
          </p>
          <div className="admin-form-group">
            <label className="admin-form-label">{t("admin.moderation.reasonLabel")}</label>
            <textarea
              className="admin-textarea"
              placeholder={t("admin.moderation.reasonPlaceholder")}
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
            />
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

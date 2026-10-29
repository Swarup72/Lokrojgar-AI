import { useState, useEffect } from "react";
import { Star, ShieldAlert, CheckCircle, Search, Eye, Filter } from "lucide-react";
import * as adminApi from "../../api/admin";
import { useLanguage } from "../../hooks/useLanguage";
import {
  AdminTable,
  AdminBadge,
  AdminPagination,
  AdminModal,
} from "../../components/admin/AdminComponents";
import "./AdminPages.css";

export function AdminRatingsPage() {
  const { t, language } = useLanguage();

  const [ratings, setRatings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [minRating, setMinRating] = useState("all");
  const [isModerated, setIsModerated] = useState("all");
  const [search, setSearch] = useState("");

  // Moderation modal
  const [targetRating, setTargetRating] = useState(null);
  const [moderationReason, setModerationReason] = useState("");
  const [hideReviewText, setHideReviewText] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRatings = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 10 };
      if (minRating !== "all") {
        params.minRating = minRating;
        params.maxRating = minRating;
      }
      if (isModerated !== "all") params.isModerated = isModerated;
      if (search.trim()) params.search = search.trim();

      const res = await adminApi.getRatings(params);
      setRatings(res.ratings || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setError(err?.message || t("admin.ratings.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRatings(1);
  }, [minRating, isModerated]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchRatings(1);
  };

  const openModeration = (rating) => {
    setTargetRating(rating);
    setModerationReason(rating.moderationReason || "");
    setHideReviewText(false);
  };

  const closeModeration = () => {
    setTargetRating(null);
    setModerationReason("");
  };

  const handleModerationSubmit = async (newModeratedState) => {
    if (!targetRating) return;
    setActionLoading(true);
    try {
      await adminApi.moderateRating(targetRating._id, {
        isModerated: newModeratedState,
        moderationReason: moderationReason.trim() || (newModeratedState ? "Review moderated by administrator" : "Review approved"),
        hideReviewText: newModeratedState && hideReviewText,
      });
      closeModeration();
      fetchRatings(pagination.page);
    } catch (err) {
      setError(err?.message || t("admin.ratings.moderateError"));
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
      key: "fromUser",
      header: t("admin.ratings.colFrom"),
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", color: "#334155", fontWeight: 500 }}>
          {row.fromUserId?.fullName || row.fromUserId?.phone || "User"}
        </span>
      ),
    },
    {
      key: "toUser",
      header: t("admin.ratings.colTo"),
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", color: "#334155", fontWeight: 500 }}>
          {row.toUserId?.fullName || row.toUserId?.phone || "User"}
        </span>
      ),
    },
    {
      key: "job",
      header: t("admin.ratings.colJob"),
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
      key: "rating",
      header: t("admin.ratings.colScore"),
      render: (row) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "2px", whiteSpace: "nowrap" }}>
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              size={12}
              color={i < row.rating ? "#f59e0b" : "#cbd5e1"}
              fill={i < row.rating ? "#f59e0b" : "none"}
            />
          ))}
          <span style={{ marginLeft: "4px", fontWeight: 700, fontSize: "0.82rem", color: "#0f172a" }}>{row.rating}</span>
        </div>
      ),
    },
    {
      key: "review",
      header: t("admin.ratings.colReview"),
      render: (row) => (
        <div style={{ maxWidth: "260px" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.82rem",
              color: row.isModerated ? "#94a3b8" : "#334155",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={row.review || ""}
          >
            {row.review || <span style={{ color: "#94a3b8" }}>{t("admin.ratings.noReviewText")}</span>}
          </p>
        </div>
      ),
    },
    {
      key: "isModerated",
      header: t("admin.ratings.colStatus"),
      render: (row) => (
        <AdminBadge variant={row.isModerated ? "blocked" : "active"}>
          {row.isModerated ? t("admin.ratings.moderated") : t("admin.status.active")}
        </AdminBadge>
      ),
    },
    {
      key: "actions",
      header: t("admin.ratings.colActions"),
      render: (row) => (
        <button
          type="button"
          className="admin-btn-sm admin-btn-outline"
          onClick={() => openModeration(row)}
          title={t("admin.ratings.moderateAction")}
          aria-label={`${t("admin.ratings.moderateAction")} rating`}
        >
          <ShieldAlert size={13} />
          <span>{t("admin.ratings.moderateAction")}</span>
        </button>
      ),
    },
  ];

  return (
    <div className="admin-ratings-page page-animate">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t("admin.ratings.title")}</h2>
          <p className="admin-page-description">{t("admin.ratings.subtitle")}</p>
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
            placeholder={t("admin.ratings.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <select
          className="admin-select"
          value={minRating}
          onChange={(e) => setMinRating(e.target.value)}
          aria-label={t("admin.ratings.filterScore")}
        >
          <option value="all">{t("admin.ratings.filterAllScores")}</option>
          <option value="1">1 Star</option>
          <option value="2">2 Stars</option>
          <option value="3">3 Stars</option>
          <option value="4">4 Stars</option>
          <option value="5">5 Stars</option>
        </select>

        <select
          className="admin-select"
          value={isModerated}
          onChange={(e) => setIsModerated(e.target.value)}
          aria-label={t("admin.ratings.filterModerated")}
        >
          <option value="all">{t("admin.filter.allStatuses")}</option>
          <option value="true">{t("admin.ratings.moderated")}</option>
          <option value="false">{t("admin.status.active")}</option>
        </select>

        <button type="button" className="admin-btn-sm admin-btn-primary" onClick={() => fetchRatings(1)}>
          <span>{t("common.search")}</span>
        </button>
      </div>

      {/* Table */}
      <div className="admin-card">
        <AdminTable columns={columns} data={ratings} loading={loading} />
        <AdminPagination
          page={pagination.page}
          pages={pagination.pages}
          total={pagination.total}
          onPageChange={fetchRatings}
        />
      </div>

      {/* Moderation Modal */}
      <AdminModal
        isOpen={Boolean(targetRating)}
        onClose={closeModeration}
        title={t("admin.ratings.modalTitle")}
        footer={
          <>
            <button type="button" className="admin-btn-sm admin-btn-outline" onClick={closeModeration}>
              {t("common.cancel")}
            </button>
            {targetRating?.isModerated ? (
              <button
                type="button"
                className="admin-btn-sm admin-btn-primary"
                onClick={() => handleModerationSubmit(false)}
                disabled={actionLoading}
              >
                <span>{t("admin.ratings.unmoderate")}</span>
              </button>
            ) : (
              <button
                type="button"
                className="admin-btn-sm admin-btn-danger"
                onClick={() => handleModerationSubmit(true)}
                disabled={actionLoading}
              >
                <span>{t("admin.ratings.flagReview")}</span>
              </button>
            )}
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ backgroundColor: "var(--color-surface-alt)", padding: "12px", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "12px", color: "var(--color-muted)", marginBottom: "4px" }}>
              {t("admin.ratings.originalReview")}:
            </div>
            <div style={{ fontWeight: 600 }}>{targetRating?.review || t("admin.ratings.noReviewText")}</div>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">{t("admin.moderation.reasonLabel")}</label>
            <textarea
              className="admin-textarea"
              placeholder={t("admin.moderation.reasonPlaceholder")}
              value={moderationReason}
              onChange={(e) => setModerationReason(e.target.value)}
            />
          </div>

          {!targetRating?.isModerated && (
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={hideReviewText}
                onChange={(e) => setHideReviewText(e.target.checked)}
              />
              <span>{t("admin.ratings.hideOffensiveContent")}</span>
            </label>
          )}
        </div>
      </AdminModal>
    </div>
  );
}

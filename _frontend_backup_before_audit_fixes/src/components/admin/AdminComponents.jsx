import { X, ChevronLeft, ChevronRight, AlertCircle, Loader2 } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import "./AdminComponents.css";

export function AdminStatCard({ title, value, subtext, icon: Icon, color = "blue" }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-header">
        <span className="admin-stat-label">{title}</span>
        {Icon && (
          <div className={`admin-stat-icon-wrapper admin-stat-icon-${color}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
      <div className="admin-stat-value">{value ?? 0}</div>
      {subtext && <div className="admin-stat-subtext">{subtext}</div>}
    </div>
  );
}

export function AdminBadge({ variant = "neutral", children }) {
  const mapVariant = () => {
    switch (variant) {
      case "active":
      case "verified":
      case "accepted":
      case "completed":
      case "resolved":
      case "paid":
        return "admin-badge-success";
      case "blocked":
      case "suspended":
      case "rejected":
      case "cancelled":
      case "failed":
        return "admin-badge-danger";
      case "pending":
      case "under_review":
      case "busy":
      case "open":
      case "shortlisted":
        return "admin-badge-warning";
      case "applied":
      case "invited":
      case "info":
        return "admin-badge-info";
      default:
        return "admin-badge-neutral";
    }
  };

  return <span className={`admin-badge ${mapVariant()}`}>{children}</span>;
}

export function AdminTable({ columns = [], data = [], loading = false, emptyMessage = null }) {
  const { t } = useLanguage();

  if (loading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-muted)" }}>
        <Loader2 className="icon-pulse" size={32} style={{ margin: "0 auto 12px" }} />
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--color-muted)" }}>
        <AlertCircle size={32} style={{ margin: "0 auto 12px", opacity: 0.6 }} />
        <p>{emptyMessage || t("admin.noDataFound")}</p>
      </div>
    );
  }

  return (
    <div className="admin-table-container">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((col, index) => (
              <th key={col.key || index} style={{ width: col.width || "auto" }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={row._id || rowIndex}>
              {columns.map((col, colIndex) => (
                <td key={col.key || colIndex}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPagination({ page = 1, pages = 1, total = 0, onPageChange }) {
  const { t } = useLanguage();
  if (pages <= 1) return null;

  return (
    <div className="admin-pagination">
      <span>
        {t("admin.paginationShowing")} {page} / {pages} ({total} {t("admin.paginationItems")})
      </span>
      <div className="admin-pagination-actions">
        <button
          type="button"
          className="admin-btn-page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t("admin.prevPage")}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="admin-btn-page"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t("admin.nextPage")}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function AdminModal({ isOpen, onClose, title, children, footer = null }) {
  if (!isOpen) return null;

  return (
    <div className="admin-modal-backdrop" onClick={onClose} aria-modal="true" role="dialog">
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2 className="admin-modal-title">{title}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>
        <div className="admin-modal-body">{children}</div>
        {footer && <div className="admin-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function AdminConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  danger = false,
  loading = false,
}) {
  const { t } = useLanguage();
  if (!isOpen) return null;

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="admin-btn-sm admin-btn-outline" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={`admin-btn-sm ${danger ? "admin-btn-danger" : "admin-btn-primary"}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="icon-pulse" /> : null}
            <span>{confirmText || t("common.confirm")}</span>
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </AdminModal>
  );
}

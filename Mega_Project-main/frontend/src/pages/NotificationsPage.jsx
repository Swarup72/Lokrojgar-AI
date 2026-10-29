import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  Briefcase,
  FileText,
  CreditCard,
  AlertTriangle,
  Megaphone,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Check,
  Loader2,
  X,
} from "lucide-react";
import { getNotifications, markAsRead, markAllAsRead } from "../api/notifications";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { pickLocalizedText } from "../utils/localizedText";
import "./NotificationsPage.css";

export function NotificationsPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [unavailableMsg, setUnavailableMsg] = useState(null);

  const userRoles = Array.isArray(user?.roles)
    ? user.roles
    : user?.role
    ? [user.role]
    : [];
  const isEmployerOnly = userRoles.includes("employer") && !userRoles.includes("worker");
  const isWorkerOnly = userRoles.includes("worker") && !userRoles.includes("employer");

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: 15,
      };

      if (onlyUnread) {
        params.isRead = false;
      }

      if (filterType !== "all") {
        params.type = filterType;
      }

      const res = await getNotifications(params);
      setNotifications(res?.notifications || []);
      setTotalPages(res?.pagination?.totalPages || 1);
      setTotal(res?.pagination?.total || 0);
      setUnreadCount(res?.unreadCount || 0);
    } catch (err) {
      setError(t("notifications.fetchError"));
    } finally {
      setLoading(false);
    }
  }, [page, filterType, onlyUnread, t]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true, readAt: new Date() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      // Ignore transient mark-read error
    }
  };

  const handleMarkAllRead = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date() })));
      setUnreadCount(0);
    } catch (err) {
      // Ignore
    } finally {
      setActionLoading(false);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "job_alert":
        return <Briefcase size={20} className="icon-job" aria-hidden="true" />;
      case "application_update":
        return <FileText size={20} className="icon-app" aria-hidden="true" />;
      case "payment_update":
        return <CreditCard size={20} className="icon-pay" aria-hidden="true" />;
      case "dispute":
        return <AlertTriangle size={20} className="icon-dispute" aria-hidden="true" />;
      case "chat":
        return <MessageSquare size={20} className="icon-chat" aria-hidden="true" />;
      case "system":
      default:
        return <Megaphone size={20} className="icon-system" aria-hidden="true" />;
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case "job_alert":
        return t("notifications.typeJobAlert");
      case "application_update":
        return t("notifications.typeApplication");
      case "payment_update":
        return t("notifications.typePayment");
      case "dispute":
        return t("notifications.typeDispute");
      case "chat":
        return t("notifications.typeChat");
      case "system":
      default:
        return t("notifications.typeAnnouncement");
    }
  };

  const getTargetLink = (item) => {
    if (!item) return null;

    const candidateLink =
      typeof item.targetLink === "string" && item.targetLink.startsWith("/")
        ? item.targetLink
        : typeof item.data?.link === "string" && item.data.link.startsWith("/")
        ? item.data.link
        : null;

    if (candidateLink) {
      if (
        isEmployerOnly &&
        (candidateLink === "/applications" ||
          candidateLink === "/job-requests" ||
          candidateLink === "/worker-availability")
      ) {
        return item.data?.jobId ? `/applicants/${item.data.jobId}` : "/employer-dashboard";
      }
      if (
        isWorkerOnly &&
        (candidateLink.startsWith("/applicants/") ||
          candidateLink === "/employer-dashboard" ||
          candidateLink === "/employer-appointments")
      ) {
        return "/applications";
      }
      return candidateLink;
    }

    if (item.type === "chat") return "/messages";

    if (item.type === "application_update") {
      if (isEmployerOnly || item.data?.recipientRole === "employer" || item.data?.senderName) {
        return item.data?.jobId ? `/applicants/${item.data.jobId}` : "/employer-dashboard";
      }
      return "/applications";
    }

    if (item.type === "job_alert") {
      const jobId = item.data?.jobId || item.refId;
      return jobId ? `/jobs/${jobId}` : "/jobs";
    }

    return null;
  };

  const handleCardClick = (item) => {
    if (!item.isRead) {
      handleMarkAsRead(item._id);
    }
    if (item.targetUnavailable) {
      setUnavailableMsg(t("notifications.targetUnavailable"));
      setSelectedNotification(item);
      return;
    }
    setUnavailableMsg(null);
    const target = getTargetLink(item);
    if (target) {
      navigate(target);
    } else {
      setSelectedNotification(item);
    }
  };

  const formatTimestamp = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  };

  return (
    <div className="notifications-page container">
      {/* Header */}
      <div className="notifications-header">
        <div className="notifications-title-area">
          <div className="notifications-icon-wrap">
            <Bell size={28} className="bell-header-icon" />
            {unreadCount > 0 && <span className="header-badge">{unreadCount}</span>}
          </div>
          <div>
            <h1 className="notifications-title">{t("notifications.title")}</h1>
            <p className="notifications-subtitle">{t("notifications.subtitle")}</p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            className="mark-all-btn"
            onClick={handleMarkAllRead}
            disabled={actionLoading}
          >
            <CheckCheck size={16} />
            <span>{t("notifications.markAllRead")}</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="notifications-filter-bar">
        <div className="notifications-filter-tabs">
          <button
            type="button"
            className={`filter-tab ${filterType === "all" && !onlyUnread ? "active" : ""}`}
            onClick={() => {
              setFilterType("all");
              setOnlyUnread(false);
              setPage(1);
            }}
          >
            {t("notifications.filterAll")}
          </button>

          <button
            type="button"
            className={`filter-tab ${onlyUnread ? "active" : ""}`}
            onClick={() => {
              setOnlyUnread(true);
              setPage(1);
            }}
          >
            {t("notifications.filterUnread")}
            {unreadCount > 0 && <span className="tab-pill">{unreadCount}</span>}
          </button>

          <button
            type="button"
            className={`filter-tab ${filterType === "job_alert" ? "active" : ""}`}
            onClick={() => {
              setFilterType("job_alert");
              setOnlyUnread(false);
              setPage(1);
            }}
          >
            {t("notifications.filterJobs")}
          </button>

          <button
            type="button"
            className={`filter-tab ${filterType === "application_update" ? "active" : ""}`}
            onClick={() => {
              setFilterType("application_update");
              setOnlyUnread(false);
              setPage(1);
            }}
          >
            {t("notifications.filterApplications")}
          </button>

          <button
            type="button"
            className={`filter-tab ${filterType === "dispute" ? "active" : ""}`}
            onClick={() => {
              setFilterType("dispute");
              setOnlyUnread(false);
              setPage(1);
            }}
          >
            {t("notifications.filterDisputes")}
          </button>

          <button
            type="button"
            className={`filter-tab ${filterType === "system" ? "active" : ""}`}
            onClick={() => {
              setFilterType("system");
              setOnlyUnread(false);
              setPage(1);
            }}
          >
            {t("notifications.filterAnnouncements")}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="notifications-loading">
          <Loader2 size={36} className="icon-pulse" />
          <p>{t("common.loading")}</p>
        </div>
      ) : error ? (
        <div className="notifications-error">
          <AlertTriangle size={36} />
          <p>{error}</p>
          <button type="button" className="retry-btn" onClick={fetchList}>
            {t("common.retry")}
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="notifications-empty">
          <Bell size={48} className="empty-bell" />
          <h2>{t("notifications.emptyTitle")}</h2>
          <p>{t("notifications.emptyDesc")}</p>
        </div>
      ) : (
        <div className="notifications-list">
          {notifications.map((item) => {
            const titleText =
              pickLocalizedText(item.rawTitle, language, "en") || item.title || "Notification";
            const bodyText = pickLocalizedText(item.rawBody, language, "en") || item.body || "";
            const targetLink = getTargetLink(item);

            return (
              <div
                key={item._id}
                className={`notification-card ${item.isRead ? "read" : "unread"}`}
                onClick={() => handleCardClick(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleCardClick(item);
                }}
              >
                <div className="notification-card-left">
                  <div className={`notification-icon-badge badge-${item.type}`}>
                    {getNotificationIcon(item.type)}
                  </div>
                </div>

                <div className="notification-card-body">
                  <div className="notification-meta-top">
                    <span className="notification-type-tag">{getTypeLabel(item.type)}</span>
                    <span className="notification-time">
                      <Clock size={12} />
                      {formatTimestamp(item.createdAt)}
                    </span>
                  </div>

                  <h3 className="notification-item-title">{titleText}</h3>
                  {bodyText && <p className="notification-item-body">{bodyText}</p>}

                  {(targetLink || item.type === "system") && (
                    <div className="notification-action-link">
                      <span>{t("notifications.viewDetails")}</span>
                      <ExternalLink size={13} />
                    </div>
                  )}
                </div>

                <div className="notification-card-right">
                  {!item.isRead ? (
                    <button
                      type="button"
                      className="mark-read-btn"
                      onClick={(e) => handleMarkAsRead(item._id, e)}
                      title={t("notifications.markAsRead")}
                      aria-label={t("notifications.markAsRead")}
                    >
                      <Check size={16} />
                    </button>
                  ) : (
                    <span className="read-indicator" title="Read">
                      <CheckCheck size={14} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && !loading && (
        <div className="notifications-pagination">
          <button
            type="button"
            className="pagination-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} />
            <span>{t("admin.prevPage")}</span>
          </button>

          <span className="pagination-info">
            {t("notifications.pageShowing", { page, totalPages })}
          </span>

          <button
            type="button"
            className="pagination-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <span>{t("admin.nextPage")}</span>
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Notification / Announcement Detail Modal */}
      {selectedNotification && (
        <div
          className="notification-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notification-detail-title"
          onClick={() => setSelectedNotification(null)}
        >
          <div
            className="notification-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="notification-detail-header">
              <div className="notification-detail-badge-wrap">
                <div className={`notification-icon-badge badge-${selectedNotification.type}`}>
                  {getNotificationIcon(selectedNotification.type)}
                </div>
                <div className="notification-detail-badge-meta">
                  <span className="notification-type-tag">
                    {getTypeLabel(selectedNotification.type)}
                  </span>
                  <div className="notification-time">
                    <Clock size={12} />
                    {formatTimestamp(selectedNotification.createdAt)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="notification-detail-close"
                onClick={() => setSelectedNotification(null)}
                aria-label={t("notifications.closeDetails")}
              >
                <X size={18} />
              </button>
            </div>

            {unavailableMsg && (
              <div className="notification-unavailable-banner" role="alert">
                <AlertTriangle size={16} />
                <span>{unavailableMsg}</span>
              </div>
            )}

            <h2 id="notification-detail-title" className="notification-detail-title">
              {pickLocalizedText(selectedNotification.rawTitle, language, "en") ||
                selectedNotification.title ||
                t("notifications.detailModalTitle")}
            </h2>
            <p className="notification-detail-body">
              {pickLocalizedText(selectedNotification.rawBody, language, "en") ||
                selectedNotification.body ||
                ""}
            </p>

            <div className="notification-detail-footer">
              <button
                type="button"
                className="mark-all-btn"
                onClick={() => setSelectedNotification(null)}
              >
                {t("notifications.closeDetails")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { Megaphone, Send, Bell, Eye, CheckCircle2, AlertCircle, Users, Building2 } from "lucide-react";
import * as adminApi from "../../api/admin";
import { useLanguage } from "../../hooks/useLanguage";
import {
  AdminStatCard,
  AdminBadge,
  AdminModal,
} from "../../components/admin/AdminComponents";
import "./AdminPages.css";

export function AdminAnnouncementsPage() {
  const { t } = useLanguage();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form states
  const [targetRole, setTargetRole] = useState("all");
  const [titleEn, setTitleEn] = useState("");
  const [titleMr, setTitleMr] = useState("");
  const [titleHi, setTitleHi] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyMr, setBodyMr] = useState("");
  const [bodyHi, setBodyHi] = useState("");

  // Preview & Confirm
  const [previewLang, setPreviewLang] = useState("en");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const sanitizeErrorMessage = (err, fallback) => {
    const raw = typeof err?.message === "string" ? err.message.trim() : "";
    if (!raw || /E11000|Mongo|collection:|dup key|index:/i.test(raw)) {
      return fallback;
    }
    return raw;
  };

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getNotificationStats();
      setStats(data);
    } catch (err) {
      setError(sanitizeErrorMessage(err, t("admin.announcements.fetchError")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleOpenConfirm = (e) => {
    e.preventDefault();
    if (!titleEn.trim() && !titleMr.trim() && !titleHi.trim()) {
      setError(t("admin.announcements.titleRequired"));
      return;
    }
    if (!bodyEn.trim() && !bodyMr.trim() && !bodyHi.trim()) {
      setError(t("admin.announcements.bodyRequired"));
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  const handleSendAnnouncement = async () => {
    setSending(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const payload = {
        targetRole,
        title: { en: titleEn.trim(), mr: titleMr.trim(), hi: titleHi.trim() },
        body: { en: bodyEn.trim(), mr: bodyMr.trim(), hi: bodyHi.trim() },
      };

      const result = await adminApi.sendAnnouncement(payload);
      setSuccessMsg(`${t("admin.announcements.sentSuccess")} (${result.sentCount} ${t("admin.announcements.recipients")})`);
      setConfirmOpen(false);

      // Reset form
      setTitleEn("");
      setTitleMr("");
      setTitleHi("");
      setBodyEn("");
      setBodyMr("");
      setBodyHi("");

      fetchStats();
    } catch (err) {
      setError(sanitizeErrorMessage(err, t("admin.announcements.sendError")));
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  };

  const getPreviewTitle = () => {
    if (previewLang === "mr") return titleMr || titleEn || "शीर्षक";
    if (previewLang === "hi") return titleHi || titleEn || "शीर्षक";
    return titleEn || "Announcement Title";
  };

  const getPreviewBody = () => {
    if (previewLang === "mr") return bodyMr || bodyEn || "सूचना मजकूर...";
    if (previewLang === "hi") return bodyHi || bodyEn || "सूचना संदेश...";
    return bodyEn || "Announcement message content...";
  };

  return (
    <div className="admin-announcements-page page-animate">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t("admin.announcements.title")}</h2>
          <p className="admin-page-description">{t("admin.announcements.subtitle")}</p>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert-danger" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="admin-alert admin-alert-success" role="alert">
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="admin-stat-grid">
        <AdminStatCard
          title={t("admin.announcements.statTotalNotifications")}
          value={stats?.totalNotifications || 0}
          icon={Bell}
          color="blue"
        />
        <AdminStatCard
          title={t("admin.announcements.statAnnouncementsSent")}
          value={stats?.countsByType?.announcement || 0}
          icon={Megaphone}
          color="purple"
        />
        <AdminStatCard
          title={t("admin.announcements.statUnreadCount")}
          value={stats?.unreadCount || 0}
          icon={Bell}
          color="amber"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
        {/* Creator Form */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h3 className="admin-card-title">{t("admin.announcements.newBroadcastTitle")}</h3>
          </div>
          <div style={{ padding: "20px" }}>
            <form onSubmit={handleOpenConfirm} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="admin-form-group">
                <label className="admin-form-label">{t("admin.announcements.targetAudienceLabel")}</label>
                <select
                  className="admin-select"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                >
                  <option value="all">{t("admin.announcements.audienceAll")}</option>
                  <option value="worker">{t("admin.announcements.audienceWorkers")}</option>
                  <option value="employer">{t("admin.announcements.audienceEmployers")}</option>
                </select>
              </div>

              {/* Title Inputs */}
              <div className="admin-form-group">
                <label className="admin-form-label">{t("admin.announcements.titleEn")}</label>
                <input
                  type="text"
                  className="visual-input"
                  style={{ width: "100%" }}
                  placeholder="e.g. Platform Scheduled Maintenance"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">{t("admin.announcements.titleMr")}</label>
                <input
                  type="text"
                  className="visual-input"
                  style={{ width: "100%" }}
                  placeholder="उदा. प्लॅटफॉर्म देखभाल सूचना"
                  value={titleMr}
                  onChange={(e) => setTitleMr(e.target.value)}
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">{t("admin.announcements.titleHi")}</label>
                <input
                  type="text"
                  className="visual-input"
                  style={{ width: "100%" }}
                  placeholder="उदा. प्लेटफ़ॉर्म रखरखाव सूचना"
                  value={titleHi}
                  onChange={(e) => setTitleHi(e.target.value)}
                />
              </div>

              {/* Message Body Inputs */}
              <div className="admin-form-group">
                <label className="admin-form-label">{t("admin.announcements.bodyEn")}</label>
                <textarea
                  className="admin-textarea"
                  placeholder="Message content in English..."
                  value={bodyEn}
                  onChange={(e) => setBodyEn(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">{t("admin.announcements.bodyMr")}</label>
                <textarea
                  className="admin-textarea"
                  placeholder="मराठीतील संदेश मजकूर..."
                  value={bodyMr}
                  onChange={(e) => setBodyMr(e.target.value)}
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">{t("admin.announcements.bodyHi")}</label>
                <textarea
                  className="admin-textarea"
                  placeholder="हिंदी में संदेश सामग्री..."
                  value={bodyHi}
                  onChange={(e) => setBodyHi(e.target.value)}
                />
              </div>

              <button type="submit" className="admin-btn-primary animated-button" style={{ marginTop: "8px" }}>
                <Send size={15} />
                <span>{t("admin.announcements.previewAndSend")}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Live Preview Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="admin-card">
            <div className="admin-card-header">
              <h3 className="admin-card-title">{t("admin.announcements.livePreviewTitle")}</h3>
              <div style={{ display: "flex", gap: "6px" }}>
                {["en", "mr", "hi"].map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className={`admin-btn-sm ${previewLang === lang ? "admin-btn-primary" : "admin-btn-outline"}`}
                    onClick={() => setPreviewLang(lang)}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: "20px" }}>
              <div
                style={{
                  border: "1px solid var(--color-primary-200)",
                  borderRadius: "var(--radius-md)",
                  padding: "16px",
                  backgroundColor: "var(--color-primary-50)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <Megaphone size={18} color="var(--color-primary)" />
                  <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--color-ink)" }}>
                    {getPreviewTitle()}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-2)", lineHeight: "1.5" }}>
                  {getPreviewBody()}
                </p>
                <div style={{ marginTop: "12px", fontSize: "11px", color: "var(--color-muted)" }}>
                  {t("admin.announcements.targetAudienceLabel")}:{" "}
                  <strong>
                    {targetRole === "all"
                      ? t("admin.announcements.audienceAll")
                      : targetRole === "worker"
                      ? t("admin.announcements.audienceWorkers")
                      : t("admin.announcements.audienceEmployers")}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AdminModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("admin.announcements.confirmSendTitle")}
        footer={
          <>
            <button
              type="button"
              className="admin-btn-sm admin-btn-outline"
              onClick={() => setConfirmOpen(false)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="admin-btn-sm admin-btn-primary"
              onClick={handleSendAnnouncement}
              disabled={sending}
            >
              <Send size={14} />
              <span>{t("admin.announcements.confirmSendBtn")}</span>
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {t("admin.announcements.confirmSendPrompt")} <strong>{targetRole.toUpperCase()}</strong>.{" "}
          {t("admin.announcements.confirmSendWarning")}
        </p>
      </AdminModal>
    </div>
  );
}

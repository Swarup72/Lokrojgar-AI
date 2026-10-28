import { useState, useEffect } from "react";
import { Cpu, CheckCircle2, AlertTriangle, RefreshCw, Zap, ShieldCheck, Activity, Layers } from "lucide-react";
import * as adminApi from "../../api/admin";
import { useLanguage } from "../../hooks/useLanguage";
import { AdminStatCard, AdminBadge } from "../../components/admin/AdminComponents";
import "./AdminPages.css";

export function AdminAiMonitoringPage() {
  const { t } = useLanguage();

  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getAiServiceStatus();
      setMonitoring(data);
    } catch (err) {
      setError(err?.message || t("admin.ai.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const isOperational = monitoring?.serviceStatus === "operational";

  return (
    <div className="admin-ai-monitoring-page page-animate">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t("admin.ai.title")}</h2>
          <p className="admin-page-description">{t("admin.ai.subtitle")}</p>
        </div>
        <button
          type="button"
          className="admin-btn-sm admin-btn-outline"
          onClick={fetchStatus}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "icon-pulse" : ""} />
          <span>{t("common.retry")}</span>
        </button>
      </div>

      {error && (
        <div className="admin-alert admin-alert-danger" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="admin-stat-grid">
        <AdminStatCard
          title={t("admin.ai.statStatus")}
          value={isOperational ? t("admin.ai.statusOperational") : t("admin.ai.statusDegraded")}
          icon={Activity}
          color={isOperational ? "green" : "red"}
          subtext={`Service: ${monitoring?.service || "lokrozgar-ai-service"}`}
        />
        <AdminStatCard
          title={t("admin.ai.statLatency")}
          value={`${monitoring?.latencyMs ?? 0} ms`}
          icon={Zap}
          color={monitoring?.latencyMs < 200 ? "green" : "amber"}
          subtext={t("admin.ai.latencySubtext")}
        />
        <AdminStatCard
          title={t("admin.ai.statVersion")}
          value={monitoring?.version || "1.0.0"}
          icon={Cpu}
          color="blue"
          subtext="FastAPI Microservice"
        />
        <AdminStatCard
          title={t("admin.ai.statCapabilities")}
          value={monitoring?.capabilities?.length || 4}
          icon={Layers}
          color="purple"
          subtext={t("admin.ai.activePipelines")}
        />
      </div>

      {/* Capabilities Overview */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">{t("admin.ai.capabilitiesTitle")}</h3>
          <AdminBadge variant={isOperational ? "verified" : "danger"}>
            {isOperational ? t("admin.ai.healthy") : t("admin.ai.unreachable")}
          </AdminBadge>
        </div>
        <div style={{ padding: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
            <div style={{ padding: "16px", backgroundColor: "var(--color-surface-alt)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>{t("admin.ai.capRecommendations")}</div>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-2)" }}>
                {t("admin.ai.capRecommendationsDesc")}
              </p>
            </div>

            <div style={{ padding: "16px", backgroundColor: "var(--color-surface-alt)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>{t("admin.ai.capVoiceExtraction")}</div>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-2)" }}>
                {t("admin.ai.capVoiceExtractionDesc")}
              </p>
            </div>

            <div style={{ padding: "16px", backgroundColor: "var(--color-surface-alt)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>{t("admin.ai.capTranslation")}</div>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-2)" }}>
                {t("admin.ai.capTranslationDesc")}
              </p>
            </div>

            <div style={{ padding: "16px", backgroundColor: "var(--color-surface-alt)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>{t("admin.ai.capSkillResolution")}</div>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-2)" }}>
                {t("admin.ai.capSkillResolutionDesc")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Safety & Instrumentation Note */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">{t("admin.ai.safetyAndPrivacyTitle")}</h3>
          <ShieldCheck size={18} color="var(--color-success)" />
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px", color: "var(--color-text-2)" }}>
          <p style={{ margin: 0 }}>
            <strong>{t("admin.ai.privacyGuarantees")}:</strong> {t("admin.ai.privacyDesc")}
          </p>
          <div style={{ padding: "12px", backgroundColor: "var(--color-primary-50)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-primary-200)" }}>
            <span style={{ fontWeight: 700, color: "var(--color-primary)" }}>{t("admin.ai.evaluationStatusLabel")}: </span>
            <span>{monitoring?.evaluationMetrics}</span>
            <p style={{ margin: "4px 0 0", color: "var(--color-text-3)", fontSize: "12px" }}>
              {t("admin.ai.evaluationDesc")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Building2,
  Briefcase,
  FileText,
  CheckCircle,
  AlertOctagon,
  AlertTriangle,
  Clock,
  TrendingUp,
  Shield,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import * as adminApi from "../../api/admin";
import { useLanguage } from "../../hooks/useLanguage";
import { AdminStatCard, AdminBadge, AdminTable } from "../../components/admin/AdminComponents";
import "./AdminPages.css";

export function AdminDashboardPage() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const stats = await adminApi.getDashboardStats();
      setData(stats);
    } catch (err) {
      setError(err?.message || t("admin.dashboard.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const summary = data?.summary || {};
  const trends = data?.trends || { workers: [], employers: [], jobs: [], applications: [] };

  const getMaxVal = (series) => {
    if (!series || series.length === 0) return 10;
    const max = Math.max(...series.map((item) => item.count));
    return max > 0 ? max : 10;
  };

  const renderBarChart = (series, colorClass) => {
    const maxVal = getMaxVal(series);
    return (
      <div className="admin-bar-chart">
        {series.map((item) => {
          const heightPct = Math.max(8, Math.round((item.count / maxVal) * 100));
          return (
            <div key={item.month} className="admin-bar-col">
              <span className="admin-bar-val">{item.count}</span>
              <div
                className={`admin-bar ${colorClass}`}
                style={{ height: `${heightPct}%` }}
                title={`${item.month}: ${item.count}`}
              />
              <span className="admin-bar-label">{item.month.slice(5)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const recentActivityColumns = [
    {
      key: "createdAt",
      header: t("admin.audit.colDate"),
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: "actionType",
      header: t("admin.audit.colAction"),
      render: (row) => <AdminBadge variant="info">{row.actionType}</AdminBadge>,
    },
    {
      key: "adminId",
      header: t("admin.audit.colAdmin"),
      render: (row) => row.adminId?.fullName || row.adminId?.phone || "Admin",
    },
    {
      key: "details",
      header: t("admin.audit.colDetails"),
      render: (row) => row.details || "-",
    },
  ];

  return (
    <div className="admin-dashboard-page page-animate">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t("admin.dashboard.title")}</h2>
          <p className="admin-page-description">{t("admin.dashboard.subtitle")}</p>
        </div>
        <button
          type="button"
          className="admin-btn-sm admin-btn-outline"
          onClick={fetchStats}
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

      {/* Summary Stat Grid */}
      <div className="admin-stat-grid">
        <AdminStatCard
          title={t("admin.dashboard.statWorkers")}
          value={summary.totalWorkers}
          icon={Users}
          color="blue"
          subtext={t("admin.dashboard.workersSubtext")}
        />
        <AdminStatCard
          title={t("admin.dashboard.statEmployers")}
          value={summary.totalEmployers}
          icon={Building2}
          color="purple"
          subtext={t("admin.dashboard.employersSubtext")}
        />
        <AdminStatCard
          title={t("admin.dashboard.statActiveJobs")}
          value={summary.activeJobs}
          icon={Briefcase}
          color="green"
          subtext={`${summary.totalJobs ?? 0} ${t("admin.dashboard.totalJobsSuffix")}`}
        />
        <AdminStatCard
          title={t("admin.dashboard.statApplications")}
          value={summary.totalApplications}
          icon={FileText}
          color="amber"
          subtext={`${summary.successfulHires ?? 0} ${t("admin.dashboard.hiresSuffix")}`}
        />
      </div>

      <div className="admin-stat-grid">
        <AdminStatCard
          title={t("admin.dashboard.statSuccessfulHires")}
          value={summary.successfulHires}
          icon={CheckCircle}
          color="green"
        />
        <AdminStatCard
          title={t("admin.dashboard.statOpenDisputes")}
          value={summary.openDisputes}
          icon={AlertTriangle}
          color="red"
        />
        <AdminStatCard
          title={t("admin.dashboard.statUnverifiedEmployers")}
          value={summary.unverifiedEmployers}
          icon={Clock}
          color="amber"
        />
        <AdminStatCard
          title={t("admin.dashboard.statSuspendedUsers")}
          value={summary.suspendedUsers}
          icon={AlertOctagon}
          color="red"
        />
      </div>

      {/* Trends Grid */}
      <div className="admin-trends-grid">
        <div className="admin-chart-card">
          <h3 className="admin-chart-title">
            <TrendingUp size={18} color="var(--color-primary)" />
            <span>{t("admin.dashboard.workerRegTrends")}</span>
          </h3>
          {renderBarChart(trends.workers, "admin-bar-blue")}
        </div>

        <div className="admin-chart-card">
          <h3 className="admin-chart-title">
            <TrendingUp size={18} color="var(--color-purple)" />
            <span>{t("admin.dashboard.employerRegTrends")}</span>
          </h3>
          {renderBarChart(trends.employers, "admin-bar-blue")}
        </div>

        <div className="admin-chart-card">
          <h3 className="admin-chart-title">
            <TrendingUp size={18} color="var(--color-success)" />
            <span>{t("admin.dashboard.jobPostingTrends")}</span>
          </h3>
          {renderBarChart(trends.jobs, "admin-bar-green")}
        </div>

        <div className="admin-chart-card">
          <h3 className="admin-chart-title">
            <TrendingUp size={18} color="var(--color-warning)" />
            <span>{t("admin.dashboard.applicationTrends")}</span>
          </h3>
          {renderBarChart(trends.applications, "admin-bar-amber")}
        </div>
      </div>

      {/* Attention & Recent Activity */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">{t("admin.dashboard.recentActivityTitle")}</h3>
          <Link to="/admin/audit-logs" className="admin-btn-sm admin-btn-outline">
            <span>{t("admin.dashboard.viewAllLogs")}</span>
            <ArrowRight size={14} />
          </Link>
        </div>
        <AdminTable
          columns={recentActivityColumns}
          data={data?.recentActivity || []}
          loading={loading}
          emptyMessage={t("admin.dashboard.noRecentActivity")}
        />
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { NavLink, Link, useNavigate, useLocation, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  FileText,
  AlertTriangle,
  Star,
  Megaphone,
  Cpu,
  ScrollText,
  Menu,
  X,
  LogOut,
  ExternalLink,
  Shield,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { LanguageSwitcher } from "../common/LanguageSwitcher";
import "./AdminLayout.css";

export function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("admin-body");
    return () => {
      document.body.classList.remove("admin-body");
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  const navItems = [
    { to: "/admin", end: true, icon: LayoutDashboard, label: t("admin.nav.dashboard") },
    { to: "/admin/workers", icon: Users, label: t("admin.nav.workers") },
    { to: "/admin/employers", icon: Building2, label: t("admin.nav.employers") },
    { to: "/admin/jobs", icon: Briefcase, label: t("admin.nav.jobs") },
    { to: "/admin/applications", icon: FileText, label: t("admin.nav.applications") },
    { to: "/admin/reports", icon: AlertTriangle, label: t("admin.nav.reports") },
    { to: "/admin/ratings", icon: Star, label: t("admin.nav.ratings") },
    { to: "/admin/announcements", icon: Megaphone, label: t("admin.nav.announcements") },
    { to: "/admin/ai-monitoring", icon: Cpu, label: t("admin.nav.aiMonitoring") },
    { to: "/admin/audit-logs", icon: ScrollText, label: t("admin.nav.auditLogs") },
  ];

  const getPageTitle = () => {
    const current = navItems.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
    );
    return current ? current.label : t("admin.portal");
  };

  return (
    <div className="admin-shell">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="admin-sidebar-header">
          <Link to="/admin" className="admin-sidebar-logo" onClick={() => setSidebarOpen(false)}>
            <Shield size={22} color="var(--color-primary, #2563eb)" />
            <span>LokRozgar AI</span>
          </Link>
          <span className="admin-badge-pill">{t("admin.roleAdmin")}</span>
        </div>

        <nav className="admin-sidebar-nav" aria-label={t("admin.navAria")}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `admin-nav-item ${isActive ? "active" : ""}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <Link to="/" className="admin-back-btn" onClick={() => setSidebarOpen(false)}>
            <ExternalLink size={14} aria-hidden="true" />
            <span>{t("admin.returnToSite")}</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="admin-main">
        {/* Topbar */}
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="admin-menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={t("admin.toggleMenu")}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h1 className="admin-topbar-title">{getPageTitle()}</h1>
          </div>

          <div className="admin-topbar-right">
            <div className="admin-topbar-lang">
              <LanguageSwitcher />
            </div>

            <div className="admin-user-pill" title={user?.fullName || user?.phone || t("admin.roleAdmin")}>
              <Shield size={14} color="var(--color-primary, #2563eb)" />
              <span className="admin-user-name">{user?.fullName || user?.phone || t("admin.roleAdmin")}</span>
            </div>

            <button
              type="button"
              className="admin-logout-btn"
              onClick={handleLogout}
              title={t("logout")}
              aria-label={t("logout")}
            >
              <LogOut size={14} />
              <span className="admin-logout-text">{t("logout")}</span>
            </button>
          </div>
        </header>

        {/* Dynamic Admin View */}
        <main className="admin-content">{children || <Outlet />}</main>
      </div>
    </div>
  );
}

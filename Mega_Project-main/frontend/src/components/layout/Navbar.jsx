import { useState, useEffect } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Briefcase,
  LayoutDashboard,
  User,
  FileText,
  PlusCircle,
  LogOut,
  LogIn,
  UserPlus,
  Inbox,
  MessageSquare,
  Menu,
  X,
  BadgeCheck,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { LanguageSwitcher } from "../common/LanguageSwitcher";
import { USER_ROLES } from "../../utils/enums";
import "./Navbar.css";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const roles = user?.roles || [];
  const isWorker = roles.includes(USER_ROLES.WORKER);
  const isEmployer = roles.includes(USER_ROLES.EMPLOYER);
  const isDualRole = isWorker && isEmployer;

  // Close drawer whenever the route changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Close drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  const handleLogout = async () => {
    await logout();
    setIsMobileOpen(false);
    navigate("/");
  };

  const navLinkClass = ({ isActive }) =>
    `navbar-link nav-item ${isActive ? "active" : ""}`;

  const drawerLinkClass = ({ isActive }) =>
    `nav-drawer-link ${isActive ? "active" : ""}`;

  return (
    <header className="navbar visual-navbar">
      <div className="navbar-inner container">
        {/* Logo Branding */}
        <Link to="/" className="navbar-logo visual-logo" aria-label="LokRozgar AI Home">
          <span className="navbar-logo-icon" aria-hidden="true">
            👷
          </span>
          <span className="navbar-logo-text">
            LOKROZGAR <span className="navbar-logo-ai">AI</span>
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="navbar-links visual-nav-links" aria-label={t("nav.mainAria")}>
          <NavLink to="/" end className={navLinkClass}>
            <Home size={17} aria-hidden="true" />
            <span>{t("home")}</span>
          </NavLink>

          <NavLink to="/jobs" className={navLinkClass}>
            <Briefcase size={17} aria-hidden="true" />
            <span>{t("findJobs")}</span>
          </NavLink>

          {/* Worker Navigation */}
          {isWorker && (
            <>
              <NavLink to="/worker-dashboard" className={navLinkClass}>
                <LayoutDashboard size={17} aria-hidden="true" />
                <span>{isDualRole ? t("nav.workerDashboard") : t("dashboard")}</span>
              </NavLink>
              <NavLink to="/applications" className={navLinkClass}>
                <FileText size={17} aria-hidden="true" />
                <span>{t("nav.applications")}</span>
              </NavLink>
              <NavLink to="/job-requests" className={navLinkClass}>
                <Inbox size={17} aria-hidden="true" />
                <span>{t("nav.jobRequests")}</span>
              </NavLink>
            </>
          )}

          {/* Employer Navigation */}
          {isEmployer && (
            <>
              <NavLink to="/employer-dashboard" className={navLinkClass}>
                <LayoutDashboard size={17} aria-hidden="true" />
                <span>{isDualRole ? t("nav.employerDashboard") : t("dashboard")}</span>
              </NavLink>
              <NavLink to="/post-job" className={navLinkClass}>
                <PlusCircle size={17} aria-hidden="true" />
                <span>{t("postJob")}</span>
              </NavLink>
            </>
          )}

          {/* Shared Authenticated Links */}
          {isAuthenticated && (
            <>
              <NavLink to="/messages" className={navLinkClass}>
                <MessageSquare size={17} aria-hidden="true" />
                <span>{t("nav.messages")}</span>
              </NavLink>
              <NavLink to="/profile" className={navLinkClass}>
                <User size={17} aria-hidden="true" />
                <span>{t("profile")}</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Desktop Actions & Mobile Menu Toggle */}
        <div className="navbar-actions">
          <div className="nav-desktop-actions">
            <LanguageSwitcher />

            {isAuthenticated ? (
              <button
                type="button"
                className="nav-logout-btn"
                onClick={handleLogout}
                aria-label={t("logout")}
              >
                <LogOut size={16} aria-hidden="true" />
                <span>{t("logout")}</span>
              </button>
            ) : (
              <div className="nav-auth-actions">
                <Link to="/login" className="nav-login-btn">
                  <LogIn size={16} aria-hidden="true" />
                  <span>{t("login")}</span>
                </Link>
                <Link to="/register" className="nav-register-btn">
                  <UserPlus size={16} aria-hidden="true" />
                  <span>{t("register")}</span>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile / Tablet Menu Button */}
          <button
            type="button"
            className="nav-mobile-toggle"
            onClick={() => setIsMobileOpen((prev) => !prev)}
            aria-label={isMobileOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={isMobileOpen}
            aria-controls="nav-mobile-drawer"
          >
            {isMobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className="nav-drawer-backdrop"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile / Tablet Navigation Drawer */}
      <div
        id="nav-mobile-drawer"
        className={`nav-drawer ${isMobileOpen ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.mainAria")}
      >
        <div className="nav-drawer-header">
          <Link to="/" className="navbar-logo" onClick={() => setIsMobileOpen(false)}>
            <span className="navbar-logo-icon" aria-hidden="true">
              👷
            </span>
            <span className="navbar-logo-text">
              LOKROZGAR <span className="navbar-logo-ai">AI</span>
            </span>
          </Link>
          <button
            type="button"
            className="nav-drawer-close"
            onClick={() => setIsMobileOpen(false)}
            aria-label={t("nav.closeMenu")}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {isAuthenticated && user && (
          <div className="nav-drawer-user">
            <div className="nav-drawer-user-info">
              <span className="nav-drawer-user-name">{user.fullName || user.phone}</span>
              <span className="nav-drawer-user-role">
                <BadgeCheck size={13} aria-hidden="true" />
                {isDualRole
                  ? t("nav.dualRole")
                  : isWorker
                  ? t("worker")
                  : isEmployer
                  ? t("employer")
                  : t("nav.userRole")}
              </span>
            </div>
          </div>
        )}

        <nav className="nav-drawer-nav" aria-label={t("nav.mainAria")}>
          <NavLink to="/" end className={drawerLinkClass}>
            <Home size={18} aria-hidden="true" />
            <span>{t("home")}</span>
          </NavLink>

          <NavLink to="/jobs" className={drawerLinkClass}>
            <Briefcase size={18} aria-hidden="true" />
            <span>{t("findJobs")}</span>
          </NavLink>

          {isWorker && (
            <>
              <div className="nav-drawer-group-label">{t("profile.title")}</div>
              <NavLink to="/worker-dashboard" className={drawerLinkClass}>
                <LayoutDashboard size={18} aria-hidden="true" />
                <span>{isDualRole ? t("nav.workerDashboard") : t("dashboard")}</span>
              </NavLink>
              <NavLink to="/applications" className={drawerLinkClass}>
                <FileText size={18} aria-hidden="true" />
                <span>{t("nav.applications")}</span>
              </NavLink>
              <NavLink to="/job-requests" className={drawerLinkClass}>
                <Inbox size={18} aria-hidden="true" />
                <span>{t("nav.jobRequests")}</span>
              </NavLink>
            </>
          )}

          {isEmployer && (
            <>
              <div className="nav-drawer-group-label">{t("employerProfile")}</div>
              <NavLink to="/employer-dashboard" className={drawerLinkClass}>
                <LayoutDashboard size={18} aria-hidden="true" />
                <span>{isDualRole ? t("nav.employerDashboard") : t("dashboard")}</span>
              </NavLink>
              <NavLink to="/post-job" className={drawerLinkClass}>
                <PlusCircle size={18} aria-hidden="true" />
                <span>{t("postJob")}</span>
              </NavLink>
            </>
          )}

          {isAuthenticated && (
            <>
              <div className="nav-drawer-group-label">{t("profile")}</div>
              <NavLink to="/messages" className={drawerLinkClass}>
                <MessageSquare size={18} aria-hidden="true" />
                <span>{t("nav.messages")}</span>
              </NavLink>
              <NavLink to="/profile" className={drawerLinkClass}>
                <User size={18} aria-hidden="true" />
                <span>{t("profile")}</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="nav-drawer-footer">
          <div className="nav-drawer-language">
            <LanguageSwitcher />
          </div>

          {isAuthenticated ? (
            <button
              type="button"
              className="nav-drawer-logout-btn"
              onClick={handleLogout}
            >
              <LogOut size={16} aria-hidden="true" />
              <span>{t("logout")}</span>
            </button>
          ) : (
            <div className="nav-drawer-auth">
              <Link
                to="/login"
                className="btn btn-secondary nav-drawer-auth-btn"
                onClick={() => setIsMobileOpen(false)}
              >
                <LogIn size={16} aria-hidden="true" />
                <span>{t("login")}</span>
              </Link>
              <Link
                to="/register"
                className="btn btn-primary nav-drawer-auth-btn"
                onClick={() => setIsMobileOpen(false)}
              >
                <UserPlus size={16} aria-hidden="true" />
                <span>{t("register")}</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

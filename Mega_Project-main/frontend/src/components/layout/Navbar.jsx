import { Link, useNavigate } from "react-router-dom";
import {
  Home,
  Briefcase,
  LayoutDashboard,
  Search,
  User,
  FileText,
  PlusCircle,
  LogOut,
  LogIn,
  UserPlus,
  Inbox,
  MessageSquare,
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

  const roles = user?.roles || [];
  const isWorker = roles.includes(USER_ROLES.WORKER);
  const isEmployer = roles.includes(USER_ROLES.EMPLOYER);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="navbar visual-navbar">
      <div className="navbar-inner container">
        <Link to="/" className="navbar-logo visual-logo">
          <span className="navbar-logo-icon" aria-hidden="true">
            👷
          </span>
          <span className="navbar-logo-text">
            LOKROZGAR <span className="navbar-logo-ai">AI</span>
          </span>
        </Link>

        <nav className="navbar-links visual-nav-links" aria-label={t("nav.mainAria")}>
          <Link to="/" className="navbar-link nav-item">
            <Home size={17} aria-hidden="true" />
            <span>{t("home")}</span>
          </Link>

          <Link to="/jobs" className="navbar-link nav-item">
            <Briefcase size={17} aria-hidden="true" />
            <span>{t("findJobs")}</span>
          </Link>

          {isWorker && (
            <>
              <Link to="/worker-dashboard" className="navbar-link nav-item">
                <LayoutDashboard size={17} aria-hidden="true" />
                <span>{t("dashboard")}</span>
              </Link>
              <Link to="/applications" className="navbar-link nav-item">
                <FileText size={17} aria-hidden="true" />
                <span>{t("nav.applications")}</span>
              </Link>
              <Link to="/job-requests" className="navbar-link nav-item">
                <Inbox size={17} aria-hidden="true" />
                <span>{t("nav.jobRequests")}</span>
              </Link>
            </>
          )}

          {isAuthenticated && (
            <Link to="/messages" className="navbar-link nav-item">
              <MessageSquare size={17} aria-hidden="true" />
              <span>{t("nav.messages")}</span>
            </Link>
          )}

          {isEmployer && (
            <>
              <Link to="/employer-dashboard" className="navbar-link nav-item">
                <LayoutDashboard size={17} aria-hidden="true" />
                <span>{t("dashboard")}</span>
              </Link>
              <Link to="/post-job" className="navbar-link nav-item">
                <PlusCircle size={17} aria-hidden="true" />
                <span>{t("postJob")}</span>
              </Link>
            </>
          )}

          {isAuthenticated && (
            <Link to="/profile" className="navbar-link nav-item">
              <User size={17} aria-hidden="true" />
              <span>{t("profile")}</span>
            </Link>
          )}
        </nav>

        <div className="navbar-actions">
          <LanguageSwitcher />
          {isAuthenticated ? (
            <button type="button" className="nav-logout-btn" onClick={handleLogout}>
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
      </div>
    </header>
  );
}

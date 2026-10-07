import { Link, useNavigate } from "react-router-dom";
import { LayoutDashboard, Search, User, FileText, PlusCircle, LogOut, Inbox, MessageSquare } from "lucide-react";
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
    <header className="navbar">
      <div className="navbar-inner container">
        <Link to="/" className="navbar-logo">
          <span className="navbar-logo-icon" aria-hidden="true">
            👷
          </span>
          <span className="navbar-logo-text">
            LOKROZGAR<span className="navbar-logo-ai">AI</span>
          </span>
        </Link>

        <nav className="navbar-links" aria-label="Main">
          <Link to="/jobs" className="navbar-link">
            <Search size={17} aria-hidden="true" />
            <span>{t("nav.jobs")}</span>
          </Link>

          {isWorker && (
            <>
              <Link to="/worker-dashboard" className="navbar-link">
                <LayoutDashboard size={17} aria-hidden="true" />
                <span>{t("nav.dashboard")}</span>
              </Link>
              <Link to="/applications" className="navbar-link">
                <FileText size={17} aria-hidden="true" />
                <span>{t("nav.applications")}</span>
              </Link>
              {/* Separate from applications because the worker is the one who
                  has to answer here. */}
              <Link to="/job-requests" className="navbar-link">
                <Inbox size={17} aria-hidden="true" />
                <span>{t("nav.jobRequests")}</span>
              </Link>
            </>
          )}

          {/* Shown to any signed-in account: chat is authorized per
              conversation, so a dual-role user needs one entry point. */}
          {isAuthenticated && (
            <Link to="/messages" className="navbar-link">
              <MessageSquare size={17} aria-hidden="true" />
              <span>{t("nav.messages")}</span>
            </Link>
          )}

          {isEmployer && (
            <>
              <Link to="/employer-dashboard" className="navbar-link">
                <LayoutDashboard size={17} aria-hidden="true" />
                <span>{t("nav.dashboard")}</span>
              </Link>
              <Link to="/post-job" className="navbar-link">
                <PlusCircle size={17} aria-hidden="true" />
                <span>{t("nav.postJob")}</span>
              </Link>
            </>
          )}

          {isAuthenticated && (
            <Link to="/profile" className="navbar-link">
              <User size={17} aria-hidden="true" />
              <span>{t("nav.profile")}</span>
            </Link>
          )}
        </nav>

        <div className="navbar-actions">
          <LanguageSwitcher />
          {isAuthenticated ? (
            <button type="button" className="nav-logout-btn" onClick={handleLogout}>
              <LogOut size={16} aria-hidden="true" />
              <span>{t("nav.logout")}</span>
            </button>
          ) : (
            <>
              <Link to="/login" className="nav-login-btn">
                {t("nav.login")}
              </Link>
              <Link to="/register" className="nav-register-btn">
                {t("nav.register")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

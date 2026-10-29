import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Shield, Phone, Lock, AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { USER_ROLES } from "../../utils/enums";
import "./AdminPages.css";

export function AdminLoginPage() {
  const { login, user, isAuthenticated, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // If already authenticated with admin role, redirect to /admin immediately
  useEffect(() => {
    document.body.classList.add("admin-body");
    return () => {
      document.body.classList.remove("admin-body");
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.roles?.includes(USER_ROLES.ADMIN)) {
      const target = location.state?.from?.pathname || "/admin";
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, user, navigate, location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const me = await login(phone.trim(), password);
      const roles = me?.user?.roles || [];

      if (!roles.includes(USER_ROLES.ADMIN)) {
        await logout();
        setError(t("admin.login.unauthorized"));
        return;
      }

      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err?.message || t("admin.login.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <div className="admin-login-icon">
            <Shield size={36} color="var(--color-primary)" />
          </div>
          <h1 className="admin-login-title">{t("admin.login.portalTitle")}</h1>
          <p className="admin-login-subtitle">{t("admin.login.portalSubtitle")}</p>
        </div>

        {error && (
          <div className="admin-alert admin-alert-danger" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="admin-form-group">
            <label htmlFor="admin-phone" className="admin-form-label">
              {t("admin.login.phoneLabel")}
            </label>
            <div className="visual-input">
              <Phone size={18} />
              <input
                id="admin-phone"
                type="tel"
                placeholder={t("admin.login.phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
              />
            </div>
          </div>

          <div className="admin-form-group">
            <label htmlFor="admin-password" className="admin-form-label">
              {t("admin.login.passwordLabel")}
            </label>
            <div className="visual-input">
              <Lock size={18} />
              <input
                id="admin-password"
                type="password"
                placeholder={t("admin.login.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            className="admin-login-submit animated-button"
            disabled={loading}
          >
            {loading ? <Loader2 size={18} className="icon-pulse" /> : null}
            <span>{loading ? t("common.loading") : t("admin.login.submitButton")}</span>
          </button>
        </form>

        <div className="admin-login-footer">
          <Link to="/" className="admin-login-back-link">
            <ArrowLeft size={14} />
            <span>{t("admin.returnToSite")}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

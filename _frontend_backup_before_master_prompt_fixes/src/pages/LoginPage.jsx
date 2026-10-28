import { useState } from "react";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { Phone, Lock, LogIn, Eye, EyeOff, Smartphone } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { isValidPhone } from "../utils/validators";
import "./AuthPage.css";

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={location.state?.from?.pathname || "/"} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFieldError(null);
    setError(null);

    if (!isValidPhone(phone)) {
      setFieldError(t("auth.error.invalidPhone"));
      return;
    }

    setSubmitting(true);
    try {
      await login(phone.trim(), password);
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page page-animate">
      <Card className="auth-card visual-auth-card slide-up">
        <div className="auth-icon icon-pulse">
          <LogIn size={28} />
        </div>

        <h1 className="auth-title">{t("welcomeBack")}</h1>
        <p className="auth-subtitle">{t("loginSubtitle")}</p>

        {error && <ErrorBanner error={error} />}
        {fieldError && <p className="auth-field-error">{fieldError}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label>
              <Smartphone size={17} />
              <span>{t("mobileNumber")}</span>
            </label>
            <div className="input-wrapper visual-input">
              <Phone size={20} aria-hidden="true" />
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={t("mobileNumberPlaceholder")}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>
              <Lock size={17} />
              <span>{t("auth.login.password")}</span>
            </label>
            <div className="input-wrapper visual-input">
              <Lock size={20} aria-hidden="true" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("passwordPlaceholder")}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button type="submit" size="lg" disabled={submitting} className="auth-btn animated-button" style={{ width: "100%", marginTop: 8 }}>
            <LogIn size={18} />
            <span>{submitting ? t("common.loading") : t("login")}</span>
          </Button>
        </form>

        <div className="auth-divider">
          <span>{t("or")}</span>
        </div>

        <p className="auth-switch register-text">
          {t("noAccount")}{" "}
          <Link to="/register">{t("createAccount")}</Link>
        </p>
      </Card>
    </div>
  );
}

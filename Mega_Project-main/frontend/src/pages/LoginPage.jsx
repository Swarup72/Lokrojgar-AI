import { useState } from "react";
import { Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { Phone, Lock } from "lucide-react";
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
    <div className="auth-page container">
      <Card className="auth-card slide-up">
        <h1 className="auth-title">{t("auth.login.title")}</h1>

        {error && <ErrorBanner error={error} />}
        {fieldError && <p className="auth-field-error">{fieldError}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <label className="auth-field">
            <span>{t("auth.login.phone")}</span>
            <div className="auth-input-wrap">
              <Phone size={18} aria-hidden="true" />
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </div>
          </label>

          <label className="auth-field">
            <span>{t("auth.login.password")}</span>
            <div className="auth-input-wrap">
              <Lock size={18} aria-hidden="true" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
          </label>

          <Button type="submit" size="lg" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? t("common.loading") : t("auth.login.submit")}
          </Button>
        </form>

        <p className="auth-switch">
          {t("auth.login.noAccount")} <Link to="/register">{t("auth.login.registerLink")}</Link>
        </p>
      </Card>
    </div>
  );
}

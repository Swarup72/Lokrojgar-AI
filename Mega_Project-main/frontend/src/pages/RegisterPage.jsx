import { useState } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import { Phone, Lock, User, Building2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { isValidPhone, isValidPassword } from "../utils/validators";
import { USER_ROLES, APP_LANGUAGES, LANGUAGE_LABELS } from "../utils/enums";
import "./AuthPage.css";

export function RegisterPage() {
  const { isAuthenticated, register } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [role, setRole] = useState(USER_ROLES.WORKER);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState(language);
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFieldError(null);
    setError(null);

    if (!isValidPhone(phone)) {
      setFieldError(t("auth.error.invalidPhone"));
      return;
    }
    if (!isValidPassword(password)) {
      setFieldError(t("auth.error.shortPassword"));
      return;
    }

    const payload = {
      phone: phone.trim(),
      password,
      roles: [role],
      preferredLanguage,
      ...(role === USER_ROLES.WORKER ? { fullName } : { businessName, businessType }),
    };

    setSubmitting(true);
    try {
      await register(payload);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page container">
      <Card className="auth-card slide-up">
        <h1 className="auth-title">{t("auth.register.title")}</h1>

        {error && <ErrorBanner error={error} />}
        {fieldError && <p className="auth-field-error">{fieldError}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <span>{t("auth.register.iAmA")}</span>
            <div className="auth-role-toggle">
              <button
                type="button"
                className={role === USER_ROLES.WORKER ? "active" : ""}
                onClick={() => setRole(USER_ROLES.WORKER)}
              >
                {t("auth.register.worker")}
              </button>
              <button
                type="button"
                className={role === USER_ROLES.EMPLOYER ? "active" : ""}
                onClick={() => setRole(USER_ROLES.EMPLOYER)}
              >
                {t("auth.register.employer")}
              </button>
            </div>
          </div>

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
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
          </label>

          {role === USER_ROLES.WORKER ? (
            <label className="auth-field">
              <span>{t("auth.register.fullName")}</span>
              <div className="auth-input-wrap">
                <User size={18} aria-hidden="true" />
                {/* Required: the server cannot create the WorkerProfile
                    without it, and a worker with no profile cannot use any
                    worker feature. */}
                <input type="text" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </div>
            </label>
          ) : (
            <>
              <label className="auth-field">
                <span>{t("auth.register.businessName")}</span>
                <div className="auth-input-wrap">
                  <Building2 size={18} aria-hidden="true" />
                  {/* Required: the server cannot create the EmployerProfile
                      without it, and an employer with no profile cannot post
                      a job. */}
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                  />
                </div>
              </label>
              <label className="auth-field">
                <span>
                  {t("auth.register.businessType")} <em>({t("common.optional")})</em>
                </span>
                <div className="auth-input-wrap">
                  <Building2 size={18} aria-hidden="true" />
                  <input
                    type="text"
                    value={businessType}
                    onChange={(event) => setBusinessType(event.target.value)}
                  />
                </div>
              </label>
            </>
          )}

          <label className="auth-field">
            <span>{t("auth.register.preferredLanguage")}</span>
            <select value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value)}>
              {APP_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </select>
          </label>

          <Button type="submit" size="lg" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? t("common.loading") : t("auth.register.submit")}
          </Button>
        </form>

        <p className="auth-switch">
          {t("auth.register.haveAccount")} <Link to="/login">{t("auth.register.loginLink")}</Link>
        </p>
      </Card>
    </div>
  );
}

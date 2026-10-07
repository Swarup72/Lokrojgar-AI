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

    // The personal name is required for every account now - it is the
    // canonical User.fullName, and the name an employer who gives no business
    // name is displayed as. Business details are employer-only and optional;
    // blank values are omitted entirely rather than sent as "".
    const payload = {
      phone: phone.trim(),
      password,
      roles: [role],
      preferredLanguage,
      fullName: fullName.trim(),
      ...(role === USER_ROLES.EMPLOYER && businessName.trim() ? { businessName: businessName.trim() } : {}),
      ...(role === USER_ROLES.EMPLOYER && businessType.trim() ? { businessType: businessType.trim() } : {}),
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

          {/* Asked of every account, whichever role: this is the person's own
              name, and for an employer with no business name it is the name
              workers will see. */}
          <label className="auth-field">
            <span>{t("auth.register.fullName")}</span>
            <div className="auth-input-wrap">
              <User size={18} aria-hidden="true" />
              <input type="text" required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </div>
          </label>

          {role === USER_ROLES.EMPLOYER && (
            <>
              <label className="auth-field">
                <span>
                  {t("auth.register.businessName")} <em>({t("common.optional")})</em>
                </span>
                <div className="auth-input-wrap">
                  <Building2 size={18} aria-hidden="true" />
                  {/* Optional by product decision - an employer may hire under
                      their own name. Left blank, jobs are shown as posted by
                      the person named above. */}
                  <input
                    type="text"
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                  />
                </div>
                <small className="auth-field-hint">{t("auth.register.businessNameHint")}</small>
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

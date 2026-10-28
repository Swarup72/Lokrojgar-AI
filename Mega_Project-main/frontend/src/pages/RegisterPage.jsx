import { useState } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import { Phone, Lock, User, Building2, UserPlus, Eye, EyeOff, Globe } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="auth-page page-animate">
      <Card className="auth-card register-card visual-auth-card slide-up">
        <div className="auth-icon icon-pulse">
          <UserPlus size={28} />
        </div>

        <h1 className="auth-title">{t("registerTitle")}</h1>
        <p className="auth-subtitle">{t("registerSubtitle")}</p>

        {error && <ErrorBanner error={error} />}
        {fieldError && <p className="auth-field-error">{fieldError}</p>}

        <form onSubmit={handleSubmit} noValidate>
          {/* Role Selection */}
          <div className="form-group">
            <label>
              👤 <span>{t("accountType")}</span>
            </label>
            <div className="role-selection visual-role-selection">
              <button
                type="button"
                className={`role-option visual-role-option ${role === USER_ROLES.WORKER ? "active" : ""}`}
                onClick={() => setRole(USER_ROLES.WORKER)}
              >
                <span className="role-big-icon">👷</span>
                <span className="role-name">{t("worker")}</span>
                <small>{t("findJobs")}</small>
              </button>

              <button
                type="button"
                className={`role-option visual-role-option ${role === USER_ROLES.EMPLOYER ? "active" : ""}`}
                onClick={() => setRole(USER_ROLES.EMPLOYER)}
              >
                <span className="role-big-icon">🏢</span>
                <span className="role-name">{t("employer")}</span>
                <small>{t("hireWorkers")}</small>
              </button>
            </div>
          </div>

          {/* Full Name */}
          <div className="form-group">
            <label>
              <User size={17} />
              <span>{t("fullName")}</span>
            </label>
            <div className="input-wrapper visual-input">
              <User size={20} aria-hidden="true" />
              <input
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder={t("fullNamePlaceholder")}
              />
            </div>
          </div>

          {/* Mobile Number */}
          <div className="form-group">
            <label>
              <Phone size={17} />
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

          {/* Password */}
          <div className="form-group">
            <label>
              <Lock size={17} />
              <span>{t("auth.login.password")}</span>
            </label>
            <div className="input-wrapper visual-input">
              <Lock size={20} aria-hidden="true" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
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

          {/* Employer details if selected */}
          {role === USER_ROLES.EMPLOYER && (
            <>
              <div className="form-group">
                <label>
                  <Building2 size={17} />
                  <span>
                    {t("auth.register.businessName")}{" "}
                    <em>({t("common.optional")})</em>
                  </span>
                </label>
                <div className="input-wrapper visual-input">
                  <Building2 size={20} aria-hidden="true" />
                  <input
                    type="text"
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                    placeholder={t("auth.register.businessNamePlaceholder")}
                  />
                </div>
                <small className="auth-field-hint">{t("auth.register.businessNameHint")}</small>
              </div>

              <div className="form-group">
                <label>
                  <Building2 size={17} />
                  <span>
                    {t("auth.register.businessType")}{" "}
                    <em>({t("common.optional")})</em>
                  </span>
                </label>
                <div className="input-wrapper visual-input">
                  <Building2 size={20} aria-hidden="true" />
                  <input
                    type="text"
                    value={businessType}
                    onChange={(event) => setBusinessType(event.target.value)}
                    placeholder={t("businessTypePlaceholder")}
                  />
                </div>
              </div>
            </>
          )}

          {/* Preferred Language */}
          <div className="form-group">
            <label>
              <Globe size={17} />
              <span>{t("auth.register.preferredLanguage")}</span>
            </label>
            <div className="input-wrapper visual-input">
              <select
                value={preferredLanguage}
                onChange={(event) => setPreferredLanguage(event.target.value)}
                style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: "15px" }}
              >
                {APP_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {LANGUAGE_LABELS[lang]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button type="submit" size="lg" disabled={submitting} className="auth-btn animated-button" style={{ width: "100%", marginTop: 12 }}>
            <UserPlus size={18} />
            <span>{submitting ? t("common.loading") : t("createAccount")}</span>
          </Button>
        </form>

        <p className="auth-switch register-text">
          {t("alreadyAccount")}{" "}
          <Link to="/login">{t("login")}</Link>
        </p>
      </Card>
    </div>
  );
}

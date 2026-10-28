import { Link } from "react-router-dom";
import { HardHat, Home, Search, LogIn, UserPlus } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { LanguageSwitcher } from "../common/LanguageSwitcher";
import "./Footer.css";

const CURRENT_YEAR = new Date().getFullYear();

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="app-footer">
      <div className="container app-footer-grid">
        <div className="app-footer-brand">
          <Link to="/" className="app-footer-logo" aria-label="LokRozgar AI Home">
            <span className="app-footer-logo-icon" aria-hidden="true">
              <HardHat size={22} />
            </span>
            <span>
              {t("app.name")} <strong>AI</strong>
            </span>
          </Link>
          <p className="app-footer-tagline">{t("app.tagline")}</p>
        </div>

        <nav className="app-footer-col" aria-label={t("footer.explore")}>
          <h4>{t("footer.explore")}</h4>
          <Link to="/"><Home size={15} /> {t("home")}</Link>
          <Link to="/jobs"><Search size={15} /> {t("findJobs")}</Link>
        </nav>

        <nav className="app-footer-col" aria-label={t("footer.account")}>
          <h4>{t("footer.account")}</h4>
          <Link to="/login"><LogIn size={15} /> {t("login")}</Link>
          <Link to="/register"><UserPlus size={15} /> {t("register")}</Link>
        </nav>

        <div className="app-footer-col app-footer-lang">
          <LanguageSwitcher />
        </div>
      </div>

      <div className="app-footer-bottom">
        <div className="container app-footer-bottom-inner">
          <span>
            © {CURRENT_YEAR} {t("app.name")} AI
          </span>
          <span>{t("footer.madeWith")}</span>
        </div>
      </div>
    </footer>
  );
}
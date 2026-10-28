import { useLanguage } from "../../hooks/useLanguage";
import "./Footer.css";

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="app-footer">
      <div className="container app-footer-inner">
        <span>
          👷 {t("app.name")} <strong>AI</strong>
        </span>
        <span className="app-footer-tagline">{t("app.tagline")}</span>
      </div>
    </footer>
  );
}

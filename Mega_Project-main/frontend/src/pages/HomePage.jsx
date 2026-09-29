import { Link } from "react-router-dom";
import { Search, Briefcase } from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";
import "./HomePage.css";

const FEATURE_KEYS = ["voice", "languages", "ai", "location", "ratings", "local"];
const FEATURE_EMOJI = {
  voice: "🎤",
  languages: "🌐",
  ai: "🤖",
  location: "📍",
  ratings: "⭐",
  local: "🏢",
};

export function HomePage() {
  const { t } = useLanguage();

  return (
    <div>
      <section className="home-hero">
        <div className="container home-hero-inner">
          <h1 className="home-hero-title">
            {t("home.hero.line1")}
            <br />
            {t("home.hero.line2")}
            <br />
            <span className="home-hero-accent">{t("home.hero.line3")}</span>
          </h1>
          <div className="home-hero-actions">
            <Link to="/jobs" className="btn btn-primary btn-lg">
              <Search size={20} aria-hidden="true" />
              <span>{t("home.hero.findJobs")}</span>
            </Link>
            <Link to="/register" className="btn btn-secondary btn-lg">
              <Briefcase size={20} aria-hidden="true" />
              <span>{t("home.hero.postJob")}</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="container">
          <h2 className="home-section-title">{t("home.features.title")}</h2>
          <div className="home-features-grid">
            {FEATURE_KEYS.map((key) => (
              <div className="home-feature-card" key={key}>
                <div className="home-feature-icon">{FEATURE_EMOJI[key]}</div>
                <h3>{t(`home.features.${key}.title`)}</h3>
                <p>{t(`home.features.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section home-section-alt">
        <div className="container">
          <h2 className="home-section-title">{t("home.howItWorks.title")}</h2>
          <div className="home-how-grid">
            <div className="home-how-column">
              <h3>{t("home.howItWorks.workers.title")}</h3>
              <ol>
                <li>{t("home.howItWorks.workers.step1")}</li>
                <li>{t("home.howItWorks.workers.step2")}</li>
                <li>{t("home.howItWorks.workers.step3")}</li>
                <li>{t("home.howItWorks.workers.step4")}</li>
              </ol>
            </div>
            <div className="home-how-column">
              <h3>{t("home.howItWorks.employers.title")}</h3>
              <ol>
                <li>{t("home.howItWorks.employers.step1")}</li>
                <li>{t("home.howItWorks.employers.step2")}</li>
                <li>{t("home.howItWorks.employers.step3")}</li>
                <li>{t("home.howItWorks.employers.step4")}</li>
              </ol>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

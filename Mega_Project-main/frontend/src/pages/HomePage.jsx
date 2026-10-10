import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  MapPin,
  Briefcase,
  Wrench,
  Droplets,
  Car,
  Package,
  HardHat,
  ShieldCheck,
  ArrowRight,
  Sparkles,
} from "lucide-react";
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
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLocation, setSearchLocation] = useState("");

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("query", searchQuery.trim());
    if (searchLocation.trim()) params.set("location", searchLocation.trim());
    navigate(`/jobs?${params.toString()}`);
  };

  const categories = [
    {
      name: t("electrician"),
      icon: Wrench,
      description: t("electricianDesc"),
      className: "stagger-1",
    },
    {
      name: t("plumber"),
      icon: Droplets,
      description: t("plumberDesc"),
      className: "stagger-2",
    },
    {
      name: t("driver"),
      icon: Car,
      description: t("driverDesc"),
      className: "stagger-3",
    },
    {
      name: t("deliveryPartner"),
      icon: Package,
      description: t("deliveryDesc"),
      className: "stagger-4",
    },
    {
      name: t("constructionWorker"),
      icon: HardHat,
      description: t("constructionDesc"),
      className: "stagger-5",
    },
    {
      name: t("securityGuard"),
      icon: ShieldCheck,
      description: t("securityDesc"),
      className: "stagger-6",
    },
  ];

  return (
    <div className="home-page page-animate">
      {/* HERO SECTION */}
      <section className="hero visual-hero">
        <div className="hero-content">
          <div className="hero-badge fade-in">
            <Sparkles size={17} />
            <span>{t("aiPoweredMatching")}</span>
          </div>

          <h1 className="hero-title slide-up">
            {t("home.hero.line1")}
            <br />
            <span>{t("home.hero.line2")}</span>
          </h1>

          <p className="hero-description fade-in">
            {t("homeDescription")}
          </p>

          {/* SEARCH BOX */}
          <form className="search-box visual-search-box slide-up" onSubmit={handleSearchSubmit}>
            <div className="search-field visual-search-field">
              <Search size={23} />
              <div>
                <span className="search-label">{t("jobSearchQuestion")}</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("jobSearchPlaceholder")}
                />
              </div>
            </div>

            <div className="search-field visual-search-field">
              <MapPin size={23} />
              <div>
                <span className="search-label">{t("where")}</span>
                <input
                  type="text"
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  placeholder={t("locationPlaceholder")}
                />
              </div>
            </div>

            <button type="submit" className="search-btn visual-search-btn animated-button">
              <Search size={20} />
              <span>{t("findJobs")}</span>
            </button>
          </form>

          {/* QUICK ACTIONS */}
          <div className="hero-quick-actions fade-in">
            <Link to="/jobs" className="quick-action">
              <span className="quick-action-icon">
                <Briefcase size={18} />
              </span>
              <span>{t("browseAllJobs")}</span>
              <ArrowRight size={16} />
            </Link>

            <Link to="/register" className="quick-action">
              <span className="quick-action-icon">👷</span>
              <span>{t("createWorkerAccount")}</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* CATEGORIES SECTION */}
      <section className="categories visual-categories">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">{t("exploreOpportunities")}</span>
            <h2>{t("findJobsByCategory")}</h2>
            <p>{t("categoryDescription")}</p>
          </div>

          <Link to="/jobs" className="view-all-link">
            <span>{t("viewAllJobs")}</span>
            <ArrowRight size={18} />
          </Link>
        </div>

        <div className="category-grid visual-category-grid">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Link
                to="/jobs"
                className={`category-card visual-category-card animated-card fade-in ${category.className}`}
                key={category.name}
              >
                <div className="category-icon animated-icon">
                  <Icon size={30} />
                </div>
                <div className="category-card-content">
                  <h3>{category.name}</h3>
                  <p>{category.description}</p>
                </div>
                <div className="category-arrow">
                  <ArrowRight size={18} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* TRUST SECTION */}
      <section className="container home-trust-section">
        <div className="trust-card">
          <div className="trust-icon">👷</div>
          <div>
            <h3>{t("builtForWorkers")}</h3>
            <p>{t("builtForWorkersDesc")}</p>
          </div>
        </div>

        <div className="trust-card">
          <div className="trust-icon">🤝</div>
          <div>
            <h3>{t("connectDirectly")}</h3>
            <p>{t("connectDirectlyDesc")}</p>
          </div>
        </div>

        <div className="trust-card">
          <div className="trust-icon">⚡</div>
          <div>
            <h3>{t("findFaster")}</h3>
            <p>{t("findFasterDesc")}</p>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="home-section">
        <div className="container">
          <h2 className="home-section-title">{t("home.features.title")}</h2>
          <div className="home-features-grid">
            {FEATURE_KEYS.map((key) => (
              <div className="home-feature-card animated-card" key={key}>
                <div className="home-feature-icon">{FEATURE_EMOJI[key]}</div>
                <h3>{t(`home.features.${key}.title`)}</h3>
                <p>{t(`home.features.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
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
